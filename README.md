# Repo Pulse

Sitio estático que se construye solo a partir del historial de Git de este repositorio y se publica en GitHub Pages.

Cada `push` a `main` dispara un workflow de GitHub Actions que:

1. Ejecuta los tests (`node --test`).
2. Lee `git log --numstat` y `git ls-files` para generar `data.json` (commits, changelog, lenguajes, archivos más tocados).
3. Consulta la API de GitHub con el `GITHUB_TOKEN` del workflow para listar issues y pull requests recientes.
4. Publica `_site/` en GitHub Pages.

Además se reconstruye a diario (`schedule`) y cuando se abre, cierra o reabre un issue.

## Activar GitHub Pages

Solo se configura una vez, desde la interfaz de GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. En un repo privado, Pages requiere un plan de pago (GitHub Pro, Team o Enterprise). Con el plan gratuito, el repo debe ser público.

La URL queda en `https://<usuario>.github.io/<repo>/`.

> El sitio publicado es público aunque el repo sea privado (salvo en Enterprise con Pages privadas). Incluye nombres de autores, mensajes de commit y títulos de issues/PRs; los correos se omiten.

## Desarrollo local

Requiere Node 20 o superior, sin dependencias.

```sh
npm test         # tests
npm run build    # genera _site/
npm run serve    # build + servidor en http://localhost:4173/
```

Fuera de Actions no hay token, así que la sección de issues/PRs se oculta.

## Estructura

```
.github/workflows/pages.yml   CI en PRs; build y deploy en main
scripts/build.mjs             genera _site/ y data.json
scripts/git-log.mjs           parser de git log (Conventional Commits, coautores, renombres)
scripts/languages.mjs         líneas por lenguaje
scripts/github-api.mjs        issues y PRs vía API REST
site/                         HTML, CSS y JS del sitio (sin frameworks)
test/                         tests con node:test
```

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat:`, `fix:`, `docs:`, `ci:`…) para que el changelog se agrupe solo.
