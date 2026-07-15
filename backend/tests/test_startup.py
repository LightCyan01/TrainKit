import os
import subprocess
import sys
from pathlib import Path


def test_api_startup_does_not_eagerly_import_ml_frameworks():
    backend_root = Path(__file__).parents[1]
    environment = {
        **os.environ,
        "TRAINKIT_BACKEND_TOKEN": "a" * 64,
        "TRAINKIT_DESKTOP_ORIGIN": "trainkit://desktop",
        "TRAINKIT_VERSION": "test",
    }
    script = (
        "import main, sys; "
        "blocked = {'torch', 'torchvision', 'transformers', 'spandrel', 'ncnn', 'difPy'}; "
        "print(','.join(sorted(blocked.intersection(sys.modules))))"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=backend_root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=20,
        check=True,
    )

    assert result.stdout.strip() == ""
