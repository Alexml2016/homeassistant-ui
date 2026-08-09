# Home Assistant Clock Panel

Полноэкранная пользовательская панель Home Assistant для iPhone/iPad.

## Landscape mode

![Landscape](images/iPhone.png)

## Alarm mode

![Alarm](images/alarm.jpeg)

## Возможности

- время в формате `HH:MM`;
- настоящий семисегментный индикатор, нарисованный CSS;
- постоянно видимые неактивные сегменты;
- мигающее двоеточие;
- текущая дата;
- температура из атрибута `temperature` сущности `weather`;
- режим охраны из бинарного сенсора;
- при включённой охране надпись `ОХРАНА ВКЛЮЧЕНА` становится главным крупным элементом панели, а часы уменьшаются;
- полноэкранный режим камеры при нажатии кнопки звонка;
- автоматический возврат к часам после настраиваемого времени;
- адаптация под альбомную и портретную ориентацию;
- учёт safe-area iPhone;
- настраиваемые ширина цифр, расстояние между часами и минутами и толщина сегментов;
- кнопка `Обновить` в левом нижнем углу для перезагрузки панели;
- отсутствие сторонних зависимостей HACS, `button-card` и `card-mod`.

## Файлы

```text
clock-panel/
├── configuration.yaml.example
├── README.md
└── src/
    ├── alarm.js
    ├── clock-panel.js
    ├── clock.js
    ├── clock.css
    ├── segments.js
    ├── utils.js
    └── weather.js
```

## Установка

### 1. Скопировать проект

Скопируйте каталог репозитория в Home Assistant:

```text
/config/www/homeassistant-ui/panels/clock/
```

После копирования основной модуль должен находиться здесь:

```text
/config/www/homeassistant-ui/panels/clock/src/clock-panel.js
```

Home Assistant опубликует его по адресу:

```text
/local/homeassistant-ui/panels/clock/src/clock-panel.js
```

### 2. Зарегистрировать панель

Добавьте в `/config/configuration.yaml`:

```yaml
panel_custom:
  - name: clock-panel
    url_path: clock-screen
    sidebar_title: Часы
    sidebar_icon: mdi:clock-digital
    module_url: /local/homeassistant-ui/panels/clock/src/clock-panel.js
    require_admin: false
    config:
      alarmEntity: binary_sensor.alarm_gateway_alarm_relay_state
      weatherEntity: weather.home_assistant
      doorbellEntity: binary_sensor.doorbell_button
      cameraEntity: camera.doorbell
      armedState: "on"
      doorbellPressedState: "on"
      doorbellDisplaySeconds: 30
      cameraFitMode: cover
      locale: ru-RU
      alarmText: ОХРАНА ВКЛЮЧЕНА
      temperaturePrefix: На улице
      digitWidth: 0.9fr
      hourMinuteGap: 42px
      segmentThickness: clamp(16px, 3.1vmin, 34px)
```

Если раздел `panel_custom:` уже существует, добавьте в него только новый элемент списка `- name: clock-panel`.

### 3. Настроить камеру звонка

RTSP-поток не записывается непосредственно в исходный код панели. Добавьте камеру в Home Assistant через интеграцию **Generic Camera** и укажите RTSP-адрес камеры в поле **Stream Source URL**. Логин и пароль камеры лучше хранить в настройках Home Assistant, а не в публичном GitHub-репозитории.

После создания камеры проверьте её `entity_id` в **Инструменты разработчика → Состояния**. В примере используется:

```text
camera.doorbell
```

Если Home Assistant создал другой идентификатор, укажите его в `cameraEntity`.

Для RTSP-потока должна быть доступна интеграция `stream`. При стандартном `default_config` она загружается автоматически.

### 4. Проверить сущности

В **Инструменты разработчика → Состояния** проверьте:

```text
binary_sensor.alarm_gateway_alarm_relay_state
weather.home_assistant
binary_sensor.doorbell_button
camera.doorbell
```

У погодной сущности должен быть атрибут:

```yaml
temperature: 18.4
```

Если идентификаторы отличаются, измените их в секции `config`.

### 5. Проверить конфигурацию и перезапустить

В Home Assistant:

```text
Инструменты разработчика → YAML → Проверить конфигурацию
```

Затем выполните полный перезапуск Home Assistant.

### 6. Открыть панель

```text
http://homeassistant.local:8123/clock-screen
```

Панель появится как отдельный раздел верхнего уровня. Её можно выбрать в штатном Kiosk Mode приложения Home Assistant для iOS.

## Режим охраны

Когда `alarmEntity` переходит в состояние `armedState`:

- фон становится красным;
- надпись `ОХРАНА ВКЛЮЧЕНА` занимает основной визуальный блок и пульсирует;
- часы уменьшаются примерно вдвое и переходят во второстепенный блок;
- дата и температура остаются видимыми.

## Режим звонка

Когда `doorbellEntity` переходит в состояние `doorbellPressedState`, панель:

1. открывает полноэкранное видео сущности `cameraEntity`;
2. показывает метку `ЗВОНОК`;
3. держит поток открытым в течение `doorbellDisplaySeconds`;
4. автоматически возвращается к часам;
5. при повторном нажатии звонка таймер запускается заново.

Панель сначала использует штатный компонент видеопотока Home Assistant. Если он недоступен, для совместимых браузеров используется HLS-поток через WebSocket API Home Assistant.

## Настройки

| Параметр | Значение по умолчанию | Назначение |
|---|---|---|
| `alarmEntity` | `binary_sensor.alarm_gateway_alarm_relay_state` | состояние режима охраны |
| `weatherEntity` | `weather.home_assistant` | погодная сущность |
| `doorbellEntity` | `binary_sensor.doorbell_button` | бинарный сенсор кнопки звонка |
| `cameraEntity` | `camera.doorbell` | камера, показываемая при звонке |
| `armedState` | `on` | состояние, означающее включённую охрану |
| `doorbellPressedState` | `on` | состояние, означающее нажатие звонка |
| `doorbellDisplaySeconds` | `30` | сколько секунд показывать камеру после звонка |
| `cameraFitMode` | `cover` | заполнение экрана камерой: `cover`, `contain` или `fill` |
| `locale` | `ru-RU` | формат даты |
| `alarmText` | `ОХРАНА ВКЛЮЧЕНА` | текст предупреждения |
| `temperaturePrefix` | `На улице` | подпись температуры |
| `digitWidth` | `0.9fr` | ширина одной цифры; принимает CSS-значение |
| `hourMinuteGap` | `42px` | расстояние между блоками часов и минут; принимает CSS-значение |
| `segmentThickness` | `clamp(16px, 3.1vmin, 34px)` | толщина сегментов; принимает CSS-значение |

Если реле охраны работает инверсно, укажите:

```yaml
armedState: "off"
```

Например, чтобы сделать цифры уже, увеличить центральный промежуток и сегменты:

```yaml
digitWidth: 0.8fr
hourMinuteGap: 56px
segmentThickness: 20px
```

Значения передаются в CSS, поэтому допустимы единицы `px`, `vw`, `vmin`, `fr` и функции `clamp(...)`.

## Обновление после изменения файлов

Приложение Home Assistant и Safari могут кэшировать JavaScript. После обновления файлов:

1. полностью закройте приложение Home Assistant;
2. откройте его снова;
3. при необходимости измените URL модуля, добавив версию:

```yaml
module_url: /local/homeassistant-ui/panels/clock/src/clock-panel.js?v=2.2.0
```

## Примечание о шрифте

Файл `DSEG7Classic-Bold.woff2` не требуется: цифры формируются отдельными CSS-сегментами. Благодаря этому неактивные сегменты остаются видимыми и панель не зависит от стороннего файла шрифта.
