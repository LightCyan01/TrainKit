import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from service.image_captioning import ImageCaptioningService

@pytest.fixture
def dummy_captioner(tmp_path):
    with patch('service.image_captioning.LlavaForConditionalGeneration.from_pretrained') as mock_model, \
         patch('service.image_captioning.AutoProcessor.from_pretrained') as mock_processor:
        mock_model.return_value = MagicMock()
        processor_instance = MagicMock()
        mock_processor.return_value = processor_instance
        
        load_path = tmp_path / "load"
        save_path = tmp_path / "save"
        load_path.mkdir()
        save_path.mkdir()
        
        captioner = ImageCaptioningService(
            model=Path("dummy-model"),
            load_path=load_path,
            save_path=save_path,
            prompt="Describe this image."
        )
        
        # Mock methods used in the pipeline
        captioner._model.generate = MagicMock(return_value=[[1, 2, 3, 4]])
        processor_instance.apply_chat_template = MagicMock(return_value="prompt")
        processor_instance.return_value = {
            "input_ids": MagicMock(shape=(1, 2)),
            "pixel_values": MagicMock()
        }
        processor_instance.tokenizer.decode = MagicMock(return_value="A cat on a mat.")
        captioner._processor = processor_instance
        return captioner

def test_image_inputs(dummy_captioner, tmp_path):
    # Create a dummy image
    img_path = tmp_path / "test.jpg"
    from PIL import Image
    Image.new("RGB", (10, 10)).save(img_path)
    inputs = dummy_captioner._image_inputs(img_path)
    assert "input_ids" in inputs

def test_generate_caption(dummy_captioner):
    dummy_inputs = {
        "input_ids": MagicMock(shape=(1, 2)),
        "pixel_values": MagicMock()
    }
    caption = dummy_captioner._generate_caption(dummy_inputs)
    assert isinstance(caption, str)
    assert caption == "A cat on a mat."

def test_save_caption(dummy_captioner, tmp_path):
    img_path = tmp_path / "test.jpg"
    img_path.touch()
    caption = "A cat on a mat."
    output_file = dummy_captioner.save_caption(caption, img_path, tmp_path)
    assert output_file.exists()
    with open(output_file, "r", encoding="utf-8") as f:
        assert f.read() == caption