from __future__ import annotations

import asyncio
import base64
import json
from io import BytesIO
from pathlib import Path
from threading import Event
from typing import Any

import httpx
from PIL import Image, ImageOps

from core.exceptions import JobCancelledError, ProcessingError
from core.jobs import JobContext
from models import CaptionRequest
from service.caption_adapters import SYSTEM_PROMPT
from service.image_captioning import process_caption_batch

ENDPOINTS = {
    "anthropic": "https://api.anthropic.com/v1/messages",
    "openai": "https://api.openai.com/v1/responses",
}
REQUEST_TIMEOUT_SECONDS = 60
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_IMAGE_BYTES = 4 * 1024 * 1024


def encode_cloud_image(image: Image.Image) -> str:
    # ponytail: one 1568px JPEG per request; add resolution controls if captions need finer detail.
    with ImageOps.exif_transpose(image) as resized:
        resized.thumbnail((1568, 1568), Image.Resampling.LANCZOS)
        resized.info.clear()
        with BytesIO() as buffer:
            resized.save(buffer, format="JPEG", quality=90)
            if buffer.tell() > MAX_IMAGE_BYTES:
                raise ProcessingError("Image is too large for cloud captioning")
            return base64.b64encode(buffer.getvalue()).decode("ascii")


def parse_cloud_caption(provider: str, response: Any) -> str:
    if not isinstance(response, dict):
        raise ProcessingError("Provider returned an invalid caption response")
    if provider == "anthropic":
        reason = response.get("stop_reason")
        if reason == "refusal":
            raise ProcessingError("Provider refused the image; no caption was written")
        if reason != "end_turn":
            raise ProcessingError("Provider returned an incomplete caption; no caption was written")
        blocks = response.get("content")
        text_type = "text"
    else:
        if (
            response.get("status") != "completed"
            or response.get("error")
            or response.get("incomplete_details")
        ):
            raise ProcessingError("Provider returned an incomplete caption; no caption was written")
        output = response.get("output")
        if not isinstance(output, list):
            raise ProcessingError("Provider returned an invalid caption response")
        blocks = []
        for item in output:
            if not isinstance(item, dict):
                raise ProcessingError("Provider returned an invalid caption response")
            if item.get("type") == "message":
                if item.get("role") != "assistant" or item.get("status") != "completed":
                    raise ProcessingError("Provider returned an incomplete caption")
                content = item.get("content")
                if not isinstance(content, list):
                    raise ProcessingError("Provider returned an invalid caption response")
                blocks.extend(content)
            elif item.get("type") != "reasoning":
                raise ProcessingError("Provider returned an invalid caption response")
        text_type = "output_text"
    if not isinstance(blocks, list) or any(not isinstance(block, dict) for block in blocks):
        raise ProcessingError("Provider returned an invalid caption response")
    if any(block.get("type") == "refusal" for block in blocks):
        raise ProcessingError("Provider refused the image; no caption was written")
    texts = [block.get("text") for block in blocks if block.get("type") == text_type]
    if not texts or any(not isinstance(text, str) for text in texts):
        raise ProcessingError("Provider returned an empty or invalid caption")
    caption = "\n".join(texts).strip()
    if not caption:
        raise ProcessingError("Provider returned an empty caption")
    return caption


async def _post_caption(
    client: httpx.AsyncClient, provider: str, headers: dict[str, str], body: dict[str, Any]
) -> Any:
    async with client.stream("POST", ENDPOINTS[provider], headers=headers, json=body) as response:
        if not response.is_success:
            status = response.status_code
            if status in {401, 403}:
                message = "Provider rejected access; check the API key and model permissions"
            elif status == 429:
                message = "Provider rate or quota limit reached; check limits before resuming"
            else:
                message = f"Provider request failed (HTTP {status}); check settings before resuming"
            raise ProcessingError(message)
        chunks = bytearray()
        async for chunk in response.aiter_bytes(chunk_size=64 * 1024):
            chunks.extend(chunk)
            if len(chunks) > MAX_RESPONSE_BYTES:
                raise ProcessingError("Provider response exceeded the size limit")
        try:
            return json.loads(chunks)
        except (ValueError, UnicodeError):
            raise ProcessingError("Provider returned an invalid caption response") from None


async def caption_cloud_image(
    client: httpx.AsyncClient,
    request: CaptionRequest,
    key: str,
    image: Image.Image,
    prompt: str,
    cancelled: Event,
) -> str:
    if cancelled.is_set():
        raise JobCancelledError()
    encoded = await asyncio.to_thread(encode_cloud_image, image)
    if cancelled.is_set():
        raise JobCancelledError()
    instruction = f"{SYSTEM_PROMPT} Return only the caption text."
    if request.provider == "anthropic":
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        body = {
            "model": request.cloud_model,
            "max_tokens": request.max_new_tokens,
            "system": instruction,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": encoded,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        }
    else:
        headers = {"authorization": f"Bearer {key}"}
        body = {
            "model": request.cloud_model,
            "max_output_tokens": request.max_new_tokens,
            "store": False,
            "instructions": instruction,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_image",
                            "image_url": f"data:image/jpeg;base64,{encoded}",
                            "detail": "auto",
                        },
                        {"type": "input_text", "text": prompt},
                    ],
                }
            ],
        }
    pending = asyncio.create_task(_post_caption(client, request.provider, headers, body))
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT_SECONDS):
            while not pending.done():
                if cancelled.is_set():
                    raise JobCancelledError()
                await asyncio.wait({pending}, timeout=0.1)
            if cancelled.is_set():
                raise JobCancelledError()
            response = await pending
    except TimeoutError:
        raise ProcessingError("Provider request timed out; no caption was written") from None
    except httpx.HTTPError:
        raise ProcessingError("Could not reach the provider; no caption was written") from None
    finally:
        if not pending.done():
            pending.cancel()
        await asyncio.gather(pending, return_exceptions=True)
    return parse_cloud_caption(request.provider, response)


async def process_cloud_caption_batch(
    request: CaptionRequest, context: JobContext, key: str
) -> Path | None:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60, connect=10, write=30, pool=10),
        follow_redirects=False,
        trust_env=False,
    ) as client:

        async def caption(image: Image.Image, prompt: str, cancelled: Event) -> str:
            return await caption_cloud_image(client, request, key, image, prompt, cancelled)

        return await process_caption_batch(request, context, caption)
