# Trip checklist

- [ ] **Move the repo off the exFAT drive to C:** at a natural break (e.g. between levels):
      `git clone https://github.com/nickfu26/100-dias.git C:\<path>\100-dias`, then `npm ci` there.
      Commit/push anything uncommitted on `I:\Si\100-dias` first, and copy over the locally generated
      audio if it isn't all committed yet.
- [ ] **Before the January trip:** confirm the Madrid Metro ticket (Tarjeta Multi with 10-trip top-up vs
      single tickets) and the current Prado admission price; update the lesson content if either changed.
- [ ] **If the trip dates change:** update `ANTES_DEL_VIAJE` (and `TRIP_START_DAY`) in `src/config.ts`.
