from pathlib import Path

from transformers import GenerationConfig

from service.caption_adapters import MultimodalChatAdapter


def test_multimodal_adapter_inserts_image_content_item():
    adapter = MultimodalChatAdapter(Path("model"), GenerationConfig())
    messages = adapter.build_messages("Describe it")
    user_content = messages[1]["content"]
    assert user_content[0] == {"type": "image"}
    assert user_content[1] == {"type": "text", "text": "Describe it"}
