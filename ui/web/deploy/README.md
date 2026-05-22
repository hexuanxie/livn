# Hosting the livn UI (static build)

Developer notes only — this folder is **not** copied to `dist/livn-ui`.

## Pyodide / WebAssembly (Apache)

Browsers require `.wasm` with `Content-Type: application/wasm`.

On publish, `htaccess` is written as `.htaccess` in the published site root.

Ensure Apache allows overrides (`AllowOverride`) and has `mod_mime`, `mod_headers`, and `mod_rewrite`.

## Other hosts

- **nginx**: `nginx-pyodide.conf`
- **Netlify / Cloudflare Pages**: `_headers` in this folder (copy manually if needed)

## API routes (optional)

`/experiments`, `/bio-api`, and `/hsds` need the livn UI server or equivalent.
Built-in demo recordings work without a backend.
