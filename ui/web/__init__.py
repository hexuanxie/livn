import subprocess
import os
import shutil
import glob

from machinable import Interface
from pydantic import BaseModel

_WEB_DIR = os.path.dirname(__file__)
_REPO_ROOT = os.path.dirname(os.path.dirname(_WEB_DIR))
_BUILD_DIR = os.path.join(_WEB_DIR, "build")
_DEFAULT_PUBLISH_DIR = os.path.join(_REPO_ROOT, "dist", "livn-ui")


class Web(Interface):
    class Config(BaseModel):
        host: str = "localhost"
        port: int = 5173
        output_dir: str | None = None

    def launch(self):
        self.build_wheel()
        self.dev()

    def build_wheel(self):
        repo_root = _REPO_ROOT
        dist_dir = os.path.join(repo_root, "dist")
        static_dir = os.path.join(_WEB_DIR, "static")

        # Build pure-Python wheel
        subprocess.run(
            ["uv", "build", "--wheel", "--out-dir", dist_dir, repo_root],
            check=True,
        )

        # Copy wheel to static/
        os.makedirs(static_dir, exist_ok=True)
        wheels = sorted(glob.glob(os.path.join(dist_dir, "livn-*.whl")))
        if not wheels:
            raise RuntimeError("No wheel built")

        # Remove old wheels from static/
        for old in glob.glob(os.path.join(static_dir, "livn-*.whl")):
            os.remove(old)

        wheel_name = os.path.basename(wheels[-1])
        target = os.path.join(static_dir, wheel_name)
        shutil.copy2(wheels[-1], target)

        # Write manifest so the frontend knows the wheel filename
        import json

        manifest = os.path.join(static_dir, "wheel.json")
        with open(manifest, "w") as f:
            json.dump({"filename": wheel_name}, f)

        print(f"Wheel copied to {target}")

    def _ensure_npm_deps(self) -> None:
        if not os.path.isdir(os.path.join(_WEB_DIR, "node_modules")):
            subprocess.run(["npm", "install"], cwd=_WEB_DIR, check=True)

    def publish(self) -> str:
        """Build the frontend as a static site for deployment to a web server."""
        self.build_wheel()
        self._ensure_npm_deps()

        print("Building static frontend…")
        subprocess.run(["npm", "run", "build"], cwd=_WEB_DIR, check=True)

        if not os.path.isdir(_BUILD_DIR):
            raise RuntimeError(f"Vite build did not produce {_BUILD_DIR}")

        dest = os.path.abspath(self.config.output_dir or _DEFAULT_PUBLISH_DIR)
        if os.path.exists(dest):
            shutil.rmtree(dest)
        shutil.copytree(_BUILD_DIR, dest)

        print(f"Static site published to {dest}")
        print(
            "Upload this directory to any static web host "
            "(nginx, Apache, S3, GitHub Pages, etc.)."
        )
        print(
            "API features (/experiments, /bio-api, /hsds) need the livn UI server "
            "or a compatible backend in front of the static files."
        )
        return dest

    def dev(self):
        self._ensure_npm_deps()

        # Start Vite dev server
        subprocess.run(
            [
                "npx",
                "vite",
                "dev",
                "--host",
                self.config.host,
                "--port",
                str(self.config.port),
            ],
            cwd=_WEB_DIR,
        )
