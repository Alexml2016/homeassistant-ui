# Lighting Manager — архитектура v0.6 / прототип 0.1

## Дерево каталогов

```text
custom_components/lighting_manager/
  __init__.py           # загрузка / выгрузка
  manifest.json         # HA integration manifest
  config_flow.py        # однократная настройка в HA UI
  const.py              # константы
  models.py             # чистая оценка правил и арбитраж
  engine.py             # подписки, хранилище, сервисы
  websocket_api.py      # администраторская API
  strings.json
  translations/{en,ru}.json
www/homeassistant-ui/panels/lighting-manager/
  lighting-manager.js   # Lovelace custom card (JSON-редактор)
docs/lighting-manager/
tests/test_lighting_manager_models.py
```

## Модель правила

Поля: `id`, `name`, `enabled`, `targets`, `days`, `start`, `end`, `end_day`, `brightness_pct`, `transition_seconds`; для движения дополнительно `active_period` вместо `end_day`.

### Вечернее освещение

```json
{
  "id": "lm_001",
  "name": "Вечернее освещение",
  "enabled": true,
  "targets": ["light.courtyard"],
  "days": [1,2,3,4,5,6,7],
  "start": {"type": "sunset", "offset_minutes": 10},
  "end": {"type": "time", "time": "23:00"},
  "end_day": "same",
  "brightness_pct": 80,
  "transition_seconds": 2
}
```

### Ночное движение

```json
{
  "id": "lm_002",
  "name": "Ночное движение",
  "enabled": true,
  "targets": ["light.courtyard"],
  "start": {"type": "motion", "entity_id": "binary_sensor.courtyard_motion"},
  "end": {"type": "no_motion", "delay_seconds": 300},
  "active_period": {
    "start": {"type": "time", "time": "23:00"},
    "end": {"type": "sunrise"},
    "end_day": "next"
  },
  "brightness_pct": 25,
  "transition_seconds": 1
}
```

### Рабочие дни на два часа

```json
{
  "id": "lm_004",
  "name": "Будни",
  "targets": ["light.office"],
  "days": [1,2,3,4,5],
  "start": {"type": "time", "time": "19:00"},
  "end": {"type": "duration", "seconds": 7200},
  "brightness_pct": 60
}
```

## Поток исполнения

1. Загрузка из `Store("lighting_manager.data")` и проверка каждого правила.
2. Подписка на `state_changed` для релевантных устройств и датчиков.
3. Каждые 10 секунд и на изменении датчика: оценка `disabled|inactive|active|pending_off|unavailable`.
4. Для каждого устройства: `OR` по правилам, `max(brightness_pct)` по явно указанным яркостям.
5. Сопоставление активных `rule_id` с предыдущим снимком, разрешение истечения ручной блокировки.
6. Только при расхождении с фактическим состоянием: сервис Home Assistant с собственным `Context`.
7. Запись конфигурации и рабочих снимков в `.storage` (через API Home Assistant, не вручную).

## Доступ

WebSocket команды (только администратору):
- `lighting_manager/get` — `rules`, `rule_states`, `outputs`, `overrides`, `entities`.
- `lighting_manager/save_rule` — `rule: object`.
- `lighting_manager/delete_rule` — `rule_id`.
- `lighting_manager/set_override` — `entity_id` и необязательное `duration_seconds`.
- `lighting_manager/clear_override` — `entity_id`.

## Принятые решения и ограничения

- Состояние недоступного `light`/`switch` не изменяется; недоступный датчик движения даёт `unavailable`/неактивность правила.
- Пользовательское изменение ловится по состоянию/атрибуту яркости с проверкой контекстов собственных команд.
- При удалении последнего правила устройство более не управляется и остаётся в текущем состоянии.
- Если несколько правил одновременно меняются, приоритет определяется совокупным набором активных правил, а не порядком их записи.
- Расписание `end_day: same` не допускает окончания раньше начала; `end_day: next` явно включает перенос на следующий календарный день.
- Задержка выключения движения определяется временем последнего перехода датчика в `off`; исторические события не восстанавливаются поминутно после перезапуска.
- Кроссплатформенный графический редактор, журнал, диагностика нештатных переходов, универсальный UI и HACS-релиз — вне начального прототипа.
