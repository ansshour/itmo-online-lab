export const APPLICATION_CLASS_NAMES = {
  root: 'application',
  frame: 'application__frame',
  workspace: 'application__workspace',
  sidebar: 'application__sidebar',
  sidebarHeader: 'application__sidebar-header',
  sidebarList: 'application__sidebar-list',
  toolbar: 'application__toolbar',
  toolbarGroup: 'application__toolbar-group',
  toolbarButton: 'application__toolbar-button',
  toolbarButtonActive: 'application__toolbar-button--active',
  primaryButton: 'application__primary-button',
  panelTitle: 'application__panel-title',
  panelCaption: 'application__panel-caption',
  paletteItem: 'application__palette-item',
  paletteItemDisabled: 'application__palette-item--disabled',
  widget: 'application__widget',
  widgetValue: 'application__widget-value',
  widgetLabel: 'application__widget-label',
  status: 'application__status',
  dragGhost: 'application__drag-ghost',
} as const;

export const APPLICATION_LABELS = {
  title: 'Лабораторная работа №6',
  subtitle: 'Компрессорная установка',
  equipmentPanel: 'Оборудование',
  sensorsPanel: 'Датчики',
  runtimePanel: 'Параметры',
  cursorMode: 'Курсор',
  connectMode: 'Соединения',
  deleteMode: 'Удаление',
  barometer: 'Барометр',
  stopwatch: 'Секундомер',
  initialStatus: 'Соберите схему Lab6 и подтвердите переход к датчикам.',
} as const;

export const APPLICATION_TEXTS = {
  sensorCount: 'шт.',
  barometerUnit: 'мм рт. ст.',
  pressureUnit: 'кПа',
  temperatureUnit: '°C',
  volumeUnit: 'м³/с',
} as const;

export const APPLICATION_NUMBERS = {
  framePadding: 24,
  animationFrameDelay: 0,
  valveStep: 1,
  millisecondsInSecond: 1000,
} as const;