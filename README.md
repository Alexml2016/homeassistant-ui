# Home Assistant UI

Единый репозиторий пользовательских панелей и общих UI-ресурсов Home Assistant.
Рабочая копия размещается в:

```text
/config/www/homeassistant-ui/
```

Home Assistant публикует её содержимое с префиксом:

```text
/local/homeassistant-ui/
```

## Структура

```text
homeassistant-ui/
├── panels/
│   ├── clock/       # полноэкранная панель часов
│   └── garage/      # будущая панель управления воротами
├── shared/
│   ├── css/         # общие темы и стили
│   ├── js/          # общие JavaScript-модули
│   └── svg/         # общая векторная графика
└── assets/
    ├── fonts/       # общие шрифты
    └── images/      # общие изображения
```

Каждая панель должна оставаться самостоятельной: собственные исходники,
документация, пример конфигурации и локальные изображения располагаются внутри
`panels/<name>/`. В `shared/` следует помещать только ресурсы, реально используемые
несколькими панелями.

## Clock Panel

Исходный репозиторий `Alexml2016/clock-panel` импортирован в `panels/clock` с
сохранением Git-истории.

Основной модуль доступен Home Assistant по адресу:

```text
/local/homeassistant-ui/panels/clock/src/clock-panel.js
```

Инструкции по настройке находятся в [panels/clock/README.md](panels/clock/README.md).

## Обновление

Из каталога `/config/www/homeassistant-ui`:

```bash
git pull --ff-only
```

После обновления JavaScript может потребоваться перезагрузка страницы или смена
параметра версии в `module_url`, чтобы обойти кэш браузера.
