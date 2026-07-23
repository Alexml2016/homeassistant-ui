# Garage Panel

Пользовательская Lovelace-карточка для управления дворовыми воротами,
гаражными воротами и калиткой.

Версия `0.3.0` использует три одинаковых по размеру блока. Сам блок больше не
отправляет команды: управление выполняется только отдельными пиктограммами.

## Возможности

В каждом блоке отображаются:

- состояние объекта;
- графическое изображение ворот или калитки;
- отдельная пиктограмма управления воротами/калиткой;
- пиктограмма лампочки для включения и выключения света;
- встроенная индикация движения от соответствующего датчика.

Температура на улице выводится в блоке «Дворовые ворота», температура в гараже —
в блоке «Гаражные ворота». Значения форматируются с одной цифрой после запятой.
Отдельный блок «Движение в гараже» удалён.

## Логика ворот

| Датчик «Открыто» | Датчик «Закрыто» | Состояние |
|---|---|---|
| `off` | `on` | закрыты |
| `on` | `off` | открыты |
| `off` | `off` | движение |
| `on` | `on` | ошибка датчиков |

Направление движения берётся из состояния `cover`: `opening` или `closing`.
Нажатие на пиктограмму ворот вызывает `cover.toggle`.

## Калитка

`wicket_sensor` используется только для отображения состояния. Пиктограмма
калитки остаётся активной и при открытой калитке. Для
`switch.ulitsa_courtyard_kalitka` вызывается `switch.turn_on`.

Поддерживаемые домены `wicket_entity`:

| Домен | Сервис |
|---|---|
| `button` | `button.press` |
| `input_button` | `input_button.press` |
| `switch` | `switch.turn_on` |
| `script` | `script.turn_on` |
| `cover` | `cover.open_cover` |
| `lock` | `lock.unlock` |

Для нестандартной команды можно задать `wicket_service` и
`wicket_service_data`.

## Свет

Параметры `courtyard_light_entity`, `garage_light_entity` и
`wicket_light_entity` принимают сущности света или переключателя. Нажатие на
лампочку вызывает универсальный сервис `homeassistant.toggle`.

Пиктограмма жёлтая, когда сущность включена. Если параметр не задан, лампочка в
соответствующем блоке скрывается.

## Датчики движения

Используются отдельные параметры:

- `courtyard_motion_sensor`;
- `garage_motion_sensor`;
- `wicket_motion_sensor`.

При активном датчике индикатор внутри блока становится зелёным и показывает
«Движение». Старый параметр `motion_sensor` поддерживается как псевдоним только
для `garage_motion_sensor`.

## Установка

Репозиторий должен находиться в каталоге:

```text
/config/www/homeassistant-ui/
```

Добавьте Lovelace-ресурс:

```text
/local/homeassistant-ui/panels/garage/src/garage-panel-0.3.0.js?v=0.3.0
```

Тип ресурса: `JavaScript Module`.

Не подключайте одновременно старые файлы `garage-panel.js`,
`garage-panel-0.2.1.js` или `garage-panel-0.2.2.js`: пользовательский элемент
`garage-panel` должен регистрироваться только одним ресурсом.

## Пример конфигурации

```yaml
type: custom:garage-panel
title: Гараж и ворота

courtyard_name: Дворовые ворота
courtyard_cover: cover.courtyard_gates
courtyard_open_sensor: binary_sensor.courtyard_gate_open_state
courtyard_closed_sensor: binary_sensor.courtyard_gate_close_state
courtyard_temperature_sensor: sensor.outdoor_temperature
courtyard_light_entity: light.courtyard_light
courtyard_motion_sensor: binary_sensor.courtyard_motion

garage_name: Гаражные ворота
garage_cover: cover.garage
garage_open_sensor: binary_sensor.garage_open_state
garage_closed_sensor: binary_sensor.garage_close_state
garage_temperature_sensor: sensor.garage_temperature
garage_light_entity: light.garage_light
garage_motion_sensor: binary_sensor.garage_motion

wicket_name: Калитка
wicket_sensor: binary_sensor.wicket_state
wicket_entity: switch.ulitsa_courtyard_kalitka
wicket_light_entity: light.wicket_light
wicket_motion_sensor: binary_sensor.wicket_motion

show_activity: true
confirm_open: false
```

Замените примерные `entity_id` на реальные идентификаторы Home Assistant.
Полный пример находится в [`examples/dashboard.yaml`](examples/dashboard.yaml).

## Параметры

### Обязательные

| Параметр | Назначение |
|---|---|
| `courtyard_cover` | управление дворовыми воротами |
| `courtyard_open_sensor` | датчик полностью открытого положения |
| `courtyard_closed_sensor` | датчик полностью закрытого положения |
| `garage_cover` | управление гаражными воротами |
| `garage_open_sensor` | датчик полностью открытого положения |
| `garage_closed_sensor` | датчик полностью закрытого положения |
| `wicket_sensor` | датчик положения калитки |
| `wicket_entity` | исполнительная сущность замка калитки |

### Дополнительные

| Параметр | Назначение |
|---|---|
| `courtyard_temperature_sensor` | температура на улице |
| `garage_temperature_sensor` | температура в гараже |
| `courtyard_light_entity` | свет возле дворовых ворот |
| `garage_light_entity` | свет в гараже |
| `wicket_light_entity` | свет возле калитки |
| `courtyard_motion_sensor` | движение возле дворовых ворот |
| `garage_motion_sensor` | движение в гараже |
| `wicket_motion_sensor` | движение возле калитки |
| `wicket_service` | явный сервис открытия калитки |
| `wicket_service_data` | данные для явного сервиса |
| `show_activity` | показывать последние изменения |
| `confirm_open` | подтверждать открытие ворот |
