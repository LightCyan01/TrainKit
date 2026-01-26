import torch
from PIL import Image
from transformers import AutoProcessor, LlavaForConditionalGeneration, GenerationConfig
from pathlib import Path
from typing import Optional, Callable, Awaitable
from config.image_formats import SUPPORTED_INPUT_EXTENSIONS
import asyncio
import gc

Image.MAX_IMAGE_PIXELS = None

# Type alias for async progress callback
ProgressCallback = Callable[[int, int, str], Awaitable[None]]

class ImageCaptioningService:
    def __init__(self, model: Path, max_new_tokens=512, temperature=0.6, top_p=0.9, top_k=None):
        self.model_path = model
        self._model = None
        self._processor = None
        self._generation_config = GenerationConfig(
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k
        )
        
    async def _load_model_async(self, progress_callback: Optional[ProgressCallback] = None):
        if self._model is not None:
            return
            
        if progress_callback:
            await progress_callback(0, 1, "Loading caption model...")
            
        loop = asyncio.get_event_loop()
        self._model, self._processor = await loop.run_in_executor(
            None, self._load_model_sync, self.model_path
        )
        
        if progress_callback:
            await progress_callback(1, 1, "Model loaded successfully")
    
    def _load_model_sync(self, model_path):
        print(f"Loading model from {model_path}...")
        model = LlavaForConditionalGeneration.from_pretrained(
            model_path, 
            torch_dtype=torch.bfloat16, 
            device_map="auto"
        )
        processor = AutoProcessor.from_pretrained(model_path)
        model.eval()
        print("Model loaded successfully")
        return model, processor
    
    def _image_inputs(self, image_path: Path, prompt: str):
        image = Image.open(image_path).convert('RGB')
        
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a professional image captioner for machine learning datasets. "
                    "Provide accurate, detailed descriptions focusing on visual elements, "
                    "composition, and relevant details. Follow user instructions carefully."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        formatted_prompt = self._processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        # Process image and text into model-ready tensors
        inputs = self._processor(
            text=[formatted_prompt],
            images=[image],
            return_tensors="pt"
        )
        
        # Move to GPU if available
        if torch.cuda.is_available():
            inputs = {k: v.to('cuda') if hasattr(v, 'to') else v 
                     for k, v in inputs.items()}
            
            if 'pixel_values' in inputs:
                inputs['pixel_values'] = inputs['pixel_values'].to(torch.bfloat16)
    
        return inputs
    
    def _generate_caption(self, inputs: dict):
        print("Generation Captions")
    
        generated_ids = self._model.generate(
            **inputs,
            generation_config=self._generation_config,
        )[0]
        
        input_length = inputs['input_ids'].shape[1]
        generated_ids = generated_ids[input_length:]
        
        caption = self._processor.tokenizer.decode(
            generated_ids,
            skip_special_tokens= True,
            clean_up_tokenization_spaces= False 
        )
        
        return caption.strip()
    
    async def caption_images(
        self,
        load_path: Path,
        save_path: Path,
        prompt: str,
        progress_callback: Optional[ProgressCallback] = None
    ):
        await self._load_model_async(progress_callback)
        
        files = [f for f in load_path.iterdir() 
            if f.is_file() and f.suffix.lower() in SUPPORTED_INPUT_EXTENSIONS]
        
        total = len(files)
        print(f"Found {total} images to caption")
        
        for idx, img_file in enumerate(files, 1):
            if progress_callback:
                await progress_callback(idx, total, f"Captioning {img_file.name}")
            
            print(f"Processing {idx}/{total}: {img_file.name}")
            
            # Run CPU-bound work in executor to not block event loop
            loop = asyncio.get_event_loop()
            inputs = await loop.run_in_executor(None, self._image_inputs, img_file, prompt)
            caption = await loop.run_in_executor(None, self._generate_caption, inputs)
            await loop.run_in_executor(None, self.save_caption, caption, img_file, save_path)
        
        print(f"Captioning complete! Processed {total} images")
    
    def save_caption(self, caption, image_path: Path, output_dir: Path = None):
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / f"{image_path.stem}.txt"
        else:
            output_file = image_path.with_suffix('.txt')
        
        with open(output_file, 'w', encoding='utf-8') as file:
            file.write(caption)
        
        print(f"Caption saved to: {output_file}")
        return output_file
    
    def cleanup(self):
        if hasattr(self, '_model') and self._model is not None:
            # Move model to CPU first to free GPU memory
            try:
                self._model.to('cpu')
            except Exception:
                pass
            del self._model
            self._model = None
        
        if hasattr(self, '_processor') and self._processor is not None:
            del self._processor
            self._processor = None
        
        # Force garbage collection before clearing CUDA cache
        gc.collect()
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()