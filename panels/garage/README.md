# Garage Panel

Компактная пользовательская Lovelace-карточка для управления:

- откатными дворовыми воротами;
- подъёмными воротами гаража;
- калиткой;
- индикацией движения в гараже.

Температура на улице выводится внутри блока «Дворовые ворота», а температура в
гараже — внутри блока «Гаражные ворота». Значения всегда форматируются с одной
цифрой после запятой.

## Логика состояния ворот

| Датчик «Открыто» | Датчик «Закрыто» | Состояние |
|---|---|---|
| `off` | `on` | закрыты |
| `on` | `off` | открыты |
| `off` | `off` | движение |
| `on` | `on` | ошибка датчиков |

Когда оба датчика выключены, направление берётся из состояния соответствующей
сущности `cover`: `opening` или `closing`. Если `cover` не сообщает направление,
панель показывает «Движение».

Нажатие на блок ворот вызывает:

```yaml
service: cover.toggle
```

При ошибке концевиков или недоступности сущностей управление блокируется.

## Калитка

Состояние калитки определяется параметром `wicket_sensor`:

- `off` — закрыта;
- `on` — открыта.

Положение калитки используется только для индикации. Кнопка открытия замка
остаётся активной и при закрытой, и при открытой калитке. Она блокируется только
при отсутствии или недоступности `wicket_sensor`.

По домену сущности `wicket_entity` сервис выбирается автоматически:

| Домен | Сервис |
|---|---|
| `button` | `button.press` |
| `input_button` | `input_button.press` |
| `switch` | `switch.turn_on` |
| `script` | `script.turn_on` |
| `cover` | `cover.open_cover` |
| `lock` | `lock.unlock` |

Для нестандартной команды можно явно задать `wicket_service` в формате
`domain.service` и, при необходимости, `wicket_service_data`.

## Установка

Репозиторий должен находиться в каталоге:

```text
/config/www/homeassistant-ui/
```

Добавьте ресурс Lovelace:

```text
/local/homeassistant-ui/panels/garage/src/garage-panel-0.2.1.js?v=0.2.1
```

Тип ресурса:

```text
JavaScript Module
```

Модуль `garage-panel-0.2.1.js` загружает базовую версию `garage-panel.js` и
применяет исправленную логику блока калитки.

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
courtyard_temperature_sensor: sensor.outdoor_temperature

garage_name: Гаражные ворота
garage_cover: cover.garage
garage_open_sensor: binary_sensor.garage_open_state
garage_closed_sensor: binary_sensor.garage_close_state
garage_temperature_sensor: sensor.garage_temperature

wicket_name: Калитка
wicket_sensor: binary_sensor.wicket_state
wicket_entity: switch.ulitsa_courtyard_kalitka

motion_name: Движение в гараже
motion_sensor: binary_sensor.garage_presense_detector

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
| `courtyard_temperature_sensor` | — | температура на улице в блоке дворовых ворот |
| `garage_temperature_sensor` | — | температура внутри гаража |
| `temperature_sensor` | — | устаревший псевдоним `garage_temperature_sensor` |
| `wicket_name` | `Калитка` | название блока калитки |
| `wicket_sensor` | — | датчик открытого/закрытого состояния калитки |
| `wicket_entity` | — | сущность, которой отправляется команда открытия |
| `wicket_service` | автоматически | явный сервис открытия, например `esphome.open_wicket` |
| `wicket_service_data` | `{}` | дополнительные данные для явного сервиса |
| `motion_sensor` | — | микроволновый датчик движения |
| `show_activity` | `true` | показывать последние изменения сущностей |
| `confirm_open` | `false` | запрашивать подтверждение перед открытием ворот |

Блок калитки скрывается, если не заданы `wicket_sensor` и команда открытия.

## Важно

Блок «Последние изменения» показывает время `last_changed` текущих сущностей.
Это не архив журнала Home Assistant и после перезапуска может отличаться от
полной истории в Logbook.
