# Garage Panel

Пользовательская Lovelace-карточка для управления двумя воротами:

- откатными дворовыми воротами;
- подъёмными воротами гаража.

Положение каждых ворот определяется двумя дискретными датчиками: «открыто» и
«закрыто». Сами датчики на панели не отображаются.

## Логика состояния

| Датчик «Открыто» | Датчик «Закрыто» | Состояние |
|---|---|---|
| `off` | `on` | закрыты |
| `on` | `off` | открыты |
| `off` | `off` | движение |
| `on` | `on` | ошибка датчиков |

Когда оба датчика выключены, направление берётся из состояния соответствующей
сущности `cover`: `opening` или `closing`. Если `cover` не сообщает направление,
панель показывает «Движение».

Нажатие на карточку вызывает сервис:

```yaml
service: cover.toggle
```

При ошибке датчиков или недоступности сущностей управление блокируется.

## Установка

Репозиторий должен находиться в каталоге:

```text
/config/www/homeassistant-ui/
```

Добавьте ресурс Lovelace:

```text
/local/homeassistant-ui/panels/garage/src/garage-panel.js?v=0.1.0
```

Тип ресурса:

```text
JavaScript Module
```

После обновления файла увеличивайте параметр `v`, чтобы браузер не использовал
старую версию из кэша.

## Конфигурация

```yaml
type: custom:garage-panel
title: Гараж и ворота

courtyard_name: Дворовые ворота
courtyard_cover: cover.courtyard_gates
courtyard_open_sensor: binary_sensor.courtyard_gate_open_state
courtyard_closed_sensor: binary_sensor.courtyard_gate_close_state

garage_name: Гаражные ворота
garage_cover: cover.garage
garage_open_sensor: binary_sensor.garage_open_state
garage_closed_sensor: binary_sensor.garage_close_state

motion_name: Движение в гараже
motion_sensor: binary_sensor.garage_presense_detector
temperature_sensor: sensor.garage_temperature

show_activity: true
confirm_open: false
```

Полный пример представления находится в
[`examples/dashboard.yaml`](examples/dashboard.yaml).

## Параметры

### Обязательные

| Параметр | Назначение |
|---|---|
| `courtyard_cover` | управление откатными воротами |
| `courtyard_open_sensor` | датчик полностью открытого положения |
| `courtyard_closed_sensor` | датчик полностью закрытого положения |
| `garage_cover` | управление подъёмными воротами |
| `garage_open_sensor` | датчик полностью открытого положения |
| `garage_closed_sensor` | датчик полностью закрытого положения |

### Дополнительные

| Параметр | По умолчанию | Назначение |
|---|---|---|
| `title` | `Гараж и ворота` | заголовок панели |
| `motion_sensor` | — | микроволновый датчик движения |
| `temperature_sensor` | — | температура в гараже |
| `show_activity` | `true` | показывать последние изменения сущностей |
| `confirm_open` | `false` | запрашивать подтверждение перед открытием |

## Важно

Блок «Последние изменения» показывает время `last_changed` текущих сущностей.
Это не архив журнала Home Assistant и после перезапуска может отличаться от
полной истории в Logbook.
