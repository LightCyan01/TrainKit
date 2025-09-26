import pytest
import tempfile
import shutil
from pathlib import Path
from PIL import Image
from unittest.mock import Mock, patch
from service.image_processing import ImageService
import torch


@pytest.fixture
def temp_dirs():
    """Create temporary input and output directories."""
    input_dir = Path(tempfile.mkdtemp())
    output_dir = Path(tempfile.mkdtemp())
    
    test_image = Image.new('RGB', (100, 100), color='red')
    test_image.save(input_dir / "test.jpg", "JPEG")
    
    yield input_dir, output_dir
    
    shutil.rmtree(input_dir)
    shutil.rmtree(output_dir)


@pytest.fixture
def image_service():
    with patch('service.image_processing.ModelLoader') as mock_loader:
        # Create a mock model that returns the same tensor (no actual upscaling)
        mock_model = Mock()
        mock_model.to.return_value = mock_model
        mock_model.eval.return_value = mock_model
        mock_model.device = "cpu"
        mock_model.return_value = torch.rand(1, 3, 100, 100) 
        
        mock_loader.return_value.load_from_file.return_value = mock_model
        
        return ImageService("dummy_model_path.pth", "cpu")


def test_upscale_default_format(image_service, temp_dirs):
    """Test upscaling with default JPG format."""
    input_dir, output_dir = temp_dirs
    
    image_service.upscale(str(input_dir), str(output_dir))
    
    output_files = list(output_dir.glob("*_upscaled.*"))
    assert len(output_files) == 1
    assert output_files[0].suffix == ".jpg"


def test_upscale_format_conversion(image_service, temp_dirs):
    """Test upscaling with format conversion."""
    input_dir, output_dir = temp_dirs
    
    image_service.upscale(str(input_dir), str(output_dir), "png")
    
    output_files = list(output_dir.glob("*_upscaled.png"))
    assert len(output_files) == 1
    
    with Image.open(output_files[0]) as img:
        assert img.format == "PNG"


def test_get_supported_formats():
    """Test getting supported output formats."""
    formats = ImageService.get_supported_output_formats()
    
    assert isinstance(formats, list)
    assert len(formats) > 0
    assert all("value" in fmt and "label" in fmt for fmt in formats)