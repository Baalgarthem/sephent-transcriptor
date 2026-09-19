# Manual de Desarrollo (manual-desarrollo.md)

Guía técnica para desarrolladores y mantenedores de **Sephent Transcriptor**.

---

## 1. Estructura de Rutas Oficiales OpenAI Whisper

OpenAI Whisper utiliza en Python la siguiente convención para resolver la carpeta de modelos:
```python
os.path.join(os.path.expanduser("~"), ".cache", "whisper")
```
En Windows esto equivale a:
`%USERPROFILE%\.cache\whisper` (habitualmente `C:\Users\<username>\.cache\whisper`).

En Linux y macOS:
`~/.cache/whisper` (o `$XDG_CACHE_HOME/whisper`).

En nuestra arquitectura, esto se encapsula en `src/services/whisperPathService.ts`.

---

## 2. Integridad de Modelos y Hashes Oficiales SHA-256

Los modelos de OpenAI Whisper cuentan con hashes canónicos calculados sobre sus pesos PyTorch (`.pt`):

| Modelo | Archivo | Hash SHA-256 Oficial |
|---|---|---|
| Tiny | `tiny.pt` | `65147644a518d12f9b095e1e240bb9508a60f3654f0a25087bbad6021deea53c` |
| Base | `base.pt` | `ed3a0b6b1c0edf879ad9b119453b0e3e814a78400f77091325ca6e4e3d4e6e8e` |
| Small | `small.pt` | `9ecf779972d9fba49f07da823075a3e3d2b974124a0280b182e500184d213923` |
| Medium | `medium.pt` | `34547462703c44a6a5740e9e5ab0b3a87f64c0700d53a240e347e370274c5ea8` |
| Large-v3 | `large-v3.pt` | `e5b1a553351376709a80de9c110e4008436a8332bba4e614079c5aa110fbc5a9` |
| Turbo | `large-v3-turbo.pt` | `aff26ae408c3d788852609fed3f695eac3a7a3c2a4f618a2a349af73e163bc60` |

El servicio `src/services/duplicateDetector.ts` utiliza la Web Crypto API (`crypto.subtle.digest`) para validar la coincidencia antes de escribir o descargar cualquier archivo.

---

## 3. Comandos de Desarrollo y Pruebas

```bash
# Iniciar servidor de desarrollo en navegador
npm run dev

# Ejecutar batería de pruebas automatizadas
npm test

# Compilar para producción web y Tauri
npm run build

# Iniciar aplicación de escritorio Tauri (requiere Rust)
npm run tauri:dev
```
