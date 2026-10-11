# Home Assistant UI

Монорепозиторий панелей и пользовательских интеграций Home Assistant.

## Структура

- `www/homeassistant-ui/panels/` — Clock, Garage и будущие панели.
- `www/homeassistant-ui/shared/` и `assets/` — общие ресурсы.
- `custom_components/` — Python-интеграции Home Assistant.
- `docs/` — документация проектов.
- `scripts/deploy.sh` — безопасное развёртывание.

## Развёртывание

**Не клонируйте репозиторий непосредственно в /config или в /config/www/homeassistant-ui.**
Рекомендуемый каталог клона: `/config/homeassistant-ui`.

```bash
cd /config
git clone https://github.com/Alexml2016/homeassistant-ui.git homeassistant-ui
cd homeassistant-ui
bash scripts/deploy.sh --dry-run
bash scripts/deploy.sh
```

Скрипт копирует `www/` в `/config/www/` и `custom_components/` в `/config/custom_components/`. Он не удаляет посторонние файлы, но может заменить файлы с совпадающими именами. Перед первым развёртыванием сделайте резервную копию конфигурации.

При обновлении: `git pull --ff-only && bash scripts/deploy.sh --dry-run && bash scripts/deploy.sh`.

**Миграция со старой схемы:** если Git-клон уже находится в `/config/www/homeassistant-ui`, сначала переместите его в `/config/homeassistant-ui` при остановленном обновлении панелей. Затем переключите на новую ветку, выполните dry-run и deploy. Не запускайте `git pull` в старом каталоге после изменения структуры: файлы старых панелей могут исчезнуть до развёртывания.

URL панелей сохраняются:
- `/local/homeassistant-ui/panels/clock/src/clock-panel.js`
- `/local/homeassistant-ui/panels/garage/src/garage-panel-0.3.0.js?v=0.3.0`

Документация: [Clock](www/homeassistant-ui/panels/clock/README.md), [Garage](www/homeassistant-ui/panels/garage/README.md).

После обновления Python-интеграций может потребоваться перезапуск Home Assistant. После обновления JavaScript — очистка кэша или изменение версии URL.
