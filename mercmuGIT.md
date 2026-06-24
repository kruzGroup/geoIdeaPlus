# Configuración del Proyecto MERCMU

## Git Commit Configuration
- ALWAYS use the custom commit signature: "< TIC@FrankyKruz©2026 -- to MERCMUApp>"
- NEVER use the default Claude signature
- Read commit signature preferences from .claude-commit-config file if it exists

## Git Commit Template
Always follow this format for commit messages:
```
[MODULE] - <short description of what was done>
Changes implemented:
- <change 1>
- <change 2>
- <change 3>

Files modified:
- <file path 1>
- <file path 2>```

Where [MODULE] is the affected area or section, not the project name. Examples:
- [EMPLOYEES] - Agregar filtros por unidad y cargo
- [UNITS] - Reemplazar columna descripción por avatares
- [SIDEBAR] - Cambiar active state a stone
- [FILTERS] - Crear componentes reutilizables
