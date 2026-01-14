import pytest
import tempfile
import shutil
from pathlib import Path
from PIL import Image
from unittest.mock import Mock, patch
from service.image_upscaling import ImageUpscaleService
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
def image_service(temp_dirs):
    input_dir, output_dir = temp_dirs
    
    with patch('service.image_upscaling.ModelLoader') as mock_loader:
        # Create a mock model descriptor
        mock_model = Mock()
        mock_model.to.return_value = mock_model
        mock_model.eval.return_value = mock_model
        mock_model.return_value = torch.rand(1, 3, 100, 100)
        
        mock_descriptor = Mock()
        mock_descriptor.model = mock_model
        mock_descriptor.scale = 2
        mock_descriptor.tiling = True
        
        mock_loader.return_value.load_from_file.return_value = mock_descriptor
        
        service = ImageUpscaleService(
            device="cpu",
            model_path=Path("dummy_model.pth"),
            load_path=input_dir,
            save_path=output_dir,
            format="jpg"
        )
        return service


def test_upscale_default_format(image_service, temp_dirs):
    """Test upscaling with default JPG format."""
    input_dir, output_dir = temp_dirs
    
    # Mock the upscale_with_tiler to avoid actual processing
    with patch.object(image_service, 'upscale_with_tiler') as mock_upscale:
        mock_upscale.return_value = Image.new('RGB', (200, 200), color='blue')
        image_service.upscale()
    
    output_files = list(output_dir.glob("*.*"))
    assert len(output_files) == 1
    assert output_files[0].suffix == ".jpg"


def test_upscale_format_conversion(temp_dirs):
    """Test upscaling with format conversion."""
    input_dir, output_dir = temp_dirs
    
    with patch('service.image_upscaling.ModelLoader') as mock_loader:
        mock_model = Mock()
        mock_model.to.return_value = mock_model
        mock_model.eval.return_value = mock_model
        mock_model.return_value = torch.rand(1, 3, 100, 100)
        
        mock_descriptor = Mock()
        mock_descriptor.model = mock_model
        mock_descriptor.scale = 2
        mock_descriptor.tiling = True
        
        mock_loader.return_value.load_from_file.return_value = mock_descriptor
        
        service = ImageUpscaleService(
            device="cpu",
            model_path=Path("dummy_model.pth"),
            load_path=input_dir,
            save_path=output_dir,
            format="png"  # Convert to PNG
        )
        
        with patch.object(service, 'upscale_with_tiler') as mock_upscale:
            mock_upscale.return_value = Image.new('RGB', (200, 200), color='blue')
            service.upscale()
    
    output_files = list(output_dir.glob("*.png"))
    assert len(output_files) == 1
    
    with Image.open(output_files[0]) as img:
        assert img.format == "PNG"


def test_supported_formats():
    """Test that supported formats are defined."""
    from config.image_formats import SUPPORTED_OUTPUT_FORMATS
    
    assert isinstance(SUPPORTED_OUTPUT_FORMATS, dict)
    assert len(SUPPORTED_OUTPUT_FORMATS) > 0
    assert "jpg" in SUPPORTED_OUTPUT_FORMATS or "jpeg" in SUPPORTED_OUTPUT_FORMATS