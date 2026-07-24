export function createCalendarConfig(partial = {}) {
  return {
    ticksPerHour: partial.ticksPerHour ?? 60,
    hoursPerDay: partial.hoursPerDay ?? 24,
    daysPerWeek: partial.daysPerWeek ?? 7,
    daysPerMonth: partial.daysPerMonth ?? 30,
    monthsPerYear: partial.monthsPerYear ?? 12,
    initialYear: partial.initialYear ?? 1,
    initialMonth: partial.initialMonth ?? 1,
    initialDay: partial.initialDay ?? 1,
    initialHour: partial.initialHour ?? 8,
  };
}

export function ticksPerDay(config) {
  return config.ticksPerHour * config.hoursPerDay;
}

export function ticksPerWeek(config) {
  return ticksPerDay(config) * config.daysPerWeek;
}

export function ticksPerMonth(config) {
  return ticksPerDay(config) * config.daysPerMonth;
}

export function ticksPerYear(config) {
  return ticksPerMonth(config) * config.monthsPerYear;
}

export function calendarFromTick(tick, config) {
  const tph = config.ticksPerHour;
  const hpd = config.hoursPerDay;
  const dpm = config.daysPerMonth;
  const mpy = config.monthsPerYear;
  const ticksPerDayValue = tph * hpd;
  const ticksPerMonthValue = ticksPerDayValue * dpm;
  const ticksPerYearValue = ticksPerMonthValue * mpy;

  let remaining = tick;
  const yearOffset = Math.floor(remaining / ticksPerYearValue);
  remaining -= yearOffset * ticksPerYearValue;
  const monthOffset = Math.floor(remaining / ticksPerMonthValue);
  remaining -= monthOffset * ticksPerMonthValue;
  const dayOffset = Math.floor(remaining / ticksPerDayValue);
  remaining -= dayOffset * ticksPerDayValue;
  const hour = Math.floor(remaining / tph);
  const minute = remaining % tph;

  return {
    tick,
    year: config.initialYear + yearOffset,
    month: config.initialMonth + monthOffset,
    day: config.initialDay + dayOffset,
    hour: hour,
    minute,
  };
}

export function createWorldClock(calendarConfig, initialTick = 0) {
  const config = createCalendarConfig(calendarConfig);
  let tick = initialTick;
  let paused = false;
  let speed = 1;

  return {
    getTick: () => tick,
    isPaused: () => paused,
    getSpeed: () => speed,
    getCalendar: () => calendarFromTick(tick, config),
    getConfig: () => ({ ...config }),
    pause() { paused = true; },
    resume() { paused = false; },
    setSpeed(next) {
      if (!Number.isFinite(next) || next < 0) throw new Error('invalid_speed');
      speed = next;
    },
    setTick(next) {
      if (!Number.isInteger(next) || next < 0) throw new Error('invalid_tick');
      tick = next;
    },
    advance(ticks = 1) {
      if (paused) return tick;
      if (!Number.isInteger(ticks) || ticks < 0) throw new Error('invalid_advance');
      tick += ticks;
      return tick;
    },
  };
}

export const CADENCES = Object.freeze({
  tick: 'tick',
  hour: 'hour',
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
});

export function createScheduler(clock) {
  const jobs = new Map();
  const systems = new Map();
  let jobSeq = 0;

  function sortJobs(list) {
    return [...list].sort((a, b) => (
      a.dueTick - b.dueTick
      || a.priority - b.priority
      || a.type.localeCompare(b.type)
      || String(a.ownerEntityId).localeCompare(String(b.ownerEntityId))
      || a.id.localeCompare(b.id)
    ));
  }

  return {
    registerSystem(system) {
      if (systems.has(system.id)) throw new Error(`duplicate_system:${system.id}`);
      systems.set(system.id, system);
    },
    scheduleJob(job) {
      const id = job.id ?? `job:${jobSeq}`;
      jobSeq += 1;
      const record = {
        id,
        type: job.type,
        dueTick: job.dueTick,
        priority: job.priority ?? 100,
        ownerEntityId: job.ownerEntityId ?? null,
        payload: job.payload ?? {},
        recurrence: job.recurrence ?? null,
        createdAtTick: clock.getTick(),
        cancelledAtTick: null,
        schemaVersion: job.schemaVersion ?? 1,
      };
      jobs.set(id, record);
      return record;
    },
    cancelJob(id, tick = clock.getTick()) {
      const job = jobs.get(id);
      if (!job) return false;
      job.cancelledAtTick = tick;
      return true;
    },
    listDueJobs(atTick = clock.getTick()) {
      return sortJobs([...jobs.values()].filter(
        (j) => j.cancelledAtTick == null && j.dueTick <= atTick,
      ));
    },
    listSystems() {
      return [...systems.values()].sort((a, b) => a.id.localeCompare(b.id));
    },
    systemsForCadence(cadence) {
      return this.listSystems().filter((s) => s.cadence === cadence);
    },
    serialize() {
      return {
        jobSeq,
        jobs: sortJobs([...jobs.values()]),
        systemIds: this.listSystems().map((s) => s.id),
      };
    },
    restore(snapshot) {
      jobs.clear();
      jobSeq = snapshot.jobSeq ?? 0;
      for (const job of snapshot.jobs ?? []) {
        jobs.set(job.id, structuredClone(job));
      }
    },
  };
}

export function createFixedStepRunner({
  clock,
  scheduler,
  calendarConfig,
  onCadence = null,
}) {
  const config = createCalendarConfig(calendarConfig);
  const dayTicks = ticksPerDay(config);
  const hourTicks = config.ticksPerHour;
  const weekTicks = ticksPerWeek(config);
  const monthTicks = ticksPerMonth(config);
  const yearTicks = ticksPerYear(config);

  function emitCadence(fromTick, toTick) {
    const fired = [];
    for (let t = fromTick + 1; t <= toTick; t += 1) {
      fired.push({ cadence: CADENCES.tick, tick: t });
      if (t % hourTicks === 0) fired.push({ cadence: CADENCES.hour, tick: t });
      if (t % dayTicks === 0) fired.push({ cadence: CADENCES.day, tick: t });
      if (t % weekTicks === 0) fired.push({ cadence: CADENCES.week, tick: t });
      if (t % monthTicks === 0) fired.push({ cadence: CADENCES.month, tick: t });
      if (t % yearTicks === 0) fired.push({ cadence: CADENCES.year, tick: t });
    }
    return fired;
  }

  return {
    stepTicks(count, context) {
      if (clock.isPaused()) return { advanced: 0, cadenceEvents: [], dueJobs: [] };
      const from = clock.getTick();
      const advanced = clock.advance(count);
      const to = clock.getTick();
      const cadenceEvents = emitCadence(from, to);
      if (onCadence) {
        for (const event of cadenceEvents) {
          onCadence(event, context);
        }
      }
      const dueJobs = scheduler.listDueJobs(to);
      return { advanced: to - from, cadenceEvents, dueJobs, tick: to };
    },
    stepOneTick(context) {
      return this.stepTicks(1, context);
    },
    stepOneHour(context) {
      return this.stepTicks(hourTicks, context);
    },
    stepOneDay(context) {
      return this.stepTicks(dayTicks, context);
    },
    runUntilTick(targetTick, context) {
      const from = clock.getTick();
      if (targetTick < from) throw new Error('invalid_run_until');
      return this.stepTicks(targetTick - from, context);
    },
  };
}
