export const LAB6_STAGE_LABELS = {
  assembly: 'Подтвердить сборку',
  instruments: 'Включить',
  running: 'Остановить',
} as const;

export const LAB6_STATUS_LABELS = {
  assembly: 'Разместите оборудование, соедините его и проверьте правильность цепочки.',
  instruments: 'Установите 2 манометра и 2 термодатчика на обе камеры.',
  running: 'Установка запущена. Вентиль можно регулировать в процессе работы.',
  assemblyError: 'Схема собрана неверно. Проверьте состав оборудования и порядок соединений.',
  sensorError: 'Для запуска нужны два манометра и два термодатчика на камерах.',
  runningStopped: 'Работа остановлена. Можно снова собрать схему или скорректировать конфигурацию.',
} as const;

export const LAB6_NUMBERS = {
  firstIdentifier: 1,
  closedValvePosition: 0,
  openedValvePosition: 9,
  graphEndDegree: 1,
  graphMiddleDegree: 2,
  requiredSensorCountPerKind: 2,
} as const;