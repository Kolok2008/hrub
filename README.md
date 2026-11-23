# Mushroom Hollow

Гра від першої особи про збір грибів в осінньому лісі. Дід залишив тобі хатину й борг у 1500 ₴: маєш 30 днів, щоб віддати його, знайти 10 сторінок дідового щоденника й вирішити долю Серця лісу.

## Що де лежить
- `Mushroom Hollow/` — готова збірка гри для браузера (відкривати через вебсервер).
- `source/` — вихідний код (three.js + Vite).
- `desktop/` — обгортка Electron для версії під Windows (Steam).

## Збірка
```
cd source && npm install && npm run build      # браузерна версія → source/dist
cp -r source/dist desktop/game                  # гра всередину десктопної обгортки
cd desktop && npm install && npm run pack-win   # Windows-версія → desktop/out
```

## Ліцензії
3D-моделі: Quaternius (CC0), див. `Mushroom Hollow/models/LICENSE.txt`.
