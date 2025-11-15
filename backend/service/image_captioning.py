import torch
from PIL import Image
from transformers import AutoProcessor, LlavaForConditionalGeneration, GenerationConfig
from pathlib import Path
from config.image_formats import SUPPORTED_INPUT_EXTENSIONS
Image.MAX_IMAGE_PIXELS = None

class ImageCaptioningService:
    def __init__(self, model: Path, load_path: Path, save_path: Path, prompt: str, max_new_tokens=512, temperature=0.6, top_p=0.9, top_k=None):
        self._model, self._processor = self._load_model(model)
        self.load_path = load_path
        self.save_path = save_path
        self.prompt = prompt
        self._generation_config = GenerationConfig(
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k
        )
        
    def _load_model(self, model_path):
        model = LlavaForConditionalGeneration.from_pretrained(model_path, dtype=torch.bfloat16, device_map="auto")
        processor = AutoProcessor.from_pretrained(model_path)
        
        model.eval()
        return model, processor
    
    def _image_inputs(self, image_path: Path):
        image = Image.open(image_path).convert('RGB')
        
        messages = [
            {
                "role": "system",
                        "content": 
                        """
                        You are a professional image captioner for machine learning datasets. 
                        Provide accurate, detailed descriptions focusing on visual elements, composition, and relevant details. 
                        Follow user instructions carefully.
                        """
            },
            {
                "role": "user",
                "content": self.prompt
            }
        ]
        
        formatted_prompt = self._processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        
        #process image and text into model-ready tensors
        inputs = self._processor(
            text=[formatted_prompt],
            images=[image],
            return_tensors="pt"
        )
        
        if torch.cuda.is_available():
            moved_inputs = {}
            
            for key, value in inputs.items():
                if hasattr(value, 'to'):
                    moved_inputs[key] = value.to('cuda')
                else:
                    moved_inputs[key] = value
            
            inputs = moved_inputs
            
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
    
    def caption_image(self):
        files = [f for f in self.load_path.iterdir() 
            if f.is_file() and f.suffix.lower() in SUPPORTED_INPUT_EXTENSIONS]
        
        for img_file in files:
            inputs = self._image_inputs(img_file)
            caption = self._generate_caption(inputs)
            self.save_caption(caption, img_file, self.save_path)
    
    def save_caption(self, caption, image_path: Path, output_dir:Path = None):
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / f"{image_path.stem}.txt"
        else:
            output_file = image_path.with_suffix('.txt')
            
        
        with open(output_file, 'w', encoding='utf-8') as file:
            file.write(caption)
            
        print(f"caption saved to: {output_file}")
        return output_file