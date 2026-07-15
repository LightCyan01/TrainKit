# Model support

TrainKit uses local model paths. It does not enable Transformers `trust_remote_code`, and Spandrel pickle checkpoints are intentionally rejected.

## Caption models

Select a local Hugging Face model directory containing `config.json` plus the model's processor/tokenizer assets and weights.

- **Auto:** reads the local configuration. `blip` selects BLIP, `instructblip` selects InstructBLIP, and other compatible configurations use the multimodal-chat adapter.
- **Multimodal chat:** loads `AutoModelForImageTextToText` and `AutoProcessor`. The processor must provide a chat template that accepts a user content list containing an image placeholder and text.
- **BLIP:** loads `BlipForConditionalGeneration`.
- **InstructBLIP:** loads `InstructBlipForConditionalGeneration`.

Compatibility depends on the installed Transformers version and the model using a built-in architecture. Models that require arbitrary repository Python code are not supported. Captions are written as UTF-8 `.txt` sidecars.

## Spandrel upscalers

Spandrel models must be a single `.safetensors` file recognized by Spandrel 0.4. TrainKit stores and invokes the returned model descriptor, reads its scale, supports direct or overlapping tiled inference, clamps output to the image range, and writes the selected image format atomically.

Legacy `.pt`, `.pth`, and `.ckpt` files can execute pickle payloads and are not accepted. Convert a trusted checkpoint to safetensors outside TrainKit if its architecture supports that workflow.

## NCNN upscalers

NCNN uses the official Python bindings. Supply:

- a text `.param` graph;
- its `.bin` weights file, or keep it beside the graph with the same stem;
- the integer model scale (default: 4);
- whether to request Vulkan compute.

TrainKit reads `input_names()` and `output_names()` from the loaded NCNN graph. A graph with one input and one output needs no blob configuration. Blob overrides are available for models exposing multiple inputs or outputs; an invalid override reports the discovered names. If the `.bin` path is omitted, TrainKit looks beside the graph with the same stem.

Blob names identify tensor edges in an NCNN graph. The extractor needs them because NCNN supports general graphs with more than one input or output, even though image upscalers normally expose only one of each.

The current generic adapter feeds contiguous RGB CHW float32 values normalized to `0..1`. It accepts CHW output with one, three, or four channels, keeps RGB, and treats output maxima up to `1.5` as normalized values. Choose or export an NCNN image upscaler with that contract. Models requiring BGR input, custom mean/normalization, multiple simultaneous inputs, recurrent state, or special pre/post-processing need a dedicated adapter.

Vulkan availability depends on the NCNN wheel, GPU, and driver. Disable Vulkan to use CPU inference. Tiling reduces peak memory and checks cancellation between tiles.

## Tagging models

Select a local directory compatible with `AutoImageProcessor` and `AutoModelForImageClassification`. The configuration should include `id2label`. Models declaring `problem_type: multi_label_classification` use sigmoid scores; other classifiers use softmax.

Threshold and top-K filtering are applied after probabilities are computed. JSON output has this shape:

```json
{
  "source": "C:\\dataset\\image.png",
  "tags": [
    { "tag": "example", "score": 0.987654 }
  ]
}
```

Text sidecars contain comma-separated labels. When both formats are selected, their destinations are collision-preflighted and renamed or skipped as a pair.
