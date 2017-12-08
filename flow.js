// Generated by CoffeeScript 1.10.0
var apdex, batch, changed, coalesce, combine, compose, contextcount, contexttime, copy, count, debounce, each, error, every, extend, filter, flatten, groupcount, grouptime, log, map, max, min, now, pipe, project, reduce, result, rollup, run, samplecount, sampletime, settle, split, stable, stats, statscount, statstime, stream, sum, tagged, taggedall, taggedany, throttle, unit;

extend = require('extend');

now = function() {
  return new Date().valueOf();
};

unit = function(params) {
  var kids, res;
  kids = [];
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    return params.emit(e, function(e) {
      var j, k, len;
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit(e);
      }
      return null;
    });
  };
  if (params.copy == null) {
    res.copy = function() {
      var j, k, len, twin;
      twin = unit(params);
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        twin(k.copy());
      }
      return twin;
    };
  } else {
    res.copy = function() {
      var j, k, len, twin;
      twin = params.copy();
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        twin(k.copy());
      }
      return twin;
    };
  }
  return res;
};

stream = function() {
  return unit({
    emit: function(e, next) {
      return next(e);
    }
  });
};

filter = function(test) {
  return unit({
    emit: function(e, next) {
      if (test(e)) {
        return next(e);
      }
    }
  });
};

tagged = function(tag) {
  return unit({
    emit: function(e, next) {
      var j, len, ref, t;
      if (e.tags == null) {
        return;
      }
      ref = e.tags;
      for (j = 0, len = ref.length; j < len; j++) {
        t = ref[j];
        if (!(t === tag)) {
          continue;
        }
        next(e);
        return;
      }
    }
  });
};

taggedany = function(tags) {
  var j, len, t, tagmap;
  tagmap = {};
  for (j = 0, len = tags.length; j < len; j++) {
    t = tags[j];
    tagmap[t] = true;
  }
  return unit({
    emit: function(e, next) {
      var l, len1, ref;
      if (e.tags == null) {
        return;
      }
      ref = e.tags;
      for (l = 0, len1 = ref.length; l < len1; l++) {
        t = ref[l];
        if (!tagmap[t]) {
          continue;
        }
        next(e);
        return;
      }
    }
  });
};

taggedall = function(tags) {
  var j, len, t, tagmap;
  tagmap = {};
  for (j = 0, len = tags.length; j < len; j++) {
    t = tags[j];
    tagmap[t] = true;
  }
  return unit({
    emit: function(e, next) {
      var count, l, len1, ref;
      if (e.tags == null) {
        return;
      }
      count = 0;
      ref = e.tags;
      for (l = 0, len1 = ref.length; l < len1; l++) {
        t = ref[l];
        if (tagmap[t]) {
          count++;
        }
      }
      if (tags.length === count) {
        next(e);
      }
      return null;
    }
  });
};

each = function(fn) {
  return unit({
    emit: function(e, next) {
      fn(e);
      return next(e);
    }
  });
};

copy = unit({
  emit: function(e, next) {
    return next(extend(true, {}, e));
  }
});

map = function(fn) {
  return unit({
    emit: function(e, next) {
      return next(fn(e));
    }
  });
};

run = function(fn) {
  return {
    emit: function(e) {
      return fn(e);
    },
    copy: function() {
      return run(fn);
    }
  };
};

reduce = function(fn) {
  return unit({
    emit: function(events, next) {
      var current, item, j, len;
      current = null;
      for (j = 0, len = events.length; j < len; j++) {
        item = events[j];
        if (item == null) {
          continue;
        }
        if (current == null) {
          current = extend({}, item, {
            time: now()
          });
        }
        current = fn(current, item);
      }
      if (current != null) {
        return next(current);
      }
    }
  });
};

max = function(selector) {
  return reduce(function(current, e) {
    if (selector(e) > selector(current)) {
      return e;
    }
    return current;
  });
};

min = function(selector) {
  return reduce(function(current, e) {
    if (selector(e) < selector(current)) {
      return e;
    }
    return current;
  });
};

sum = function(selector) {
  return reduce(function(current, e) {
    if (e.metric == null) {
      e.metric = 0;
    }
    e.metric += selector(e);
    return e;
  });
};

count = reduce(function(current, e) {
  if (e.metric == null) {
    e.metric = 0;
  }
  e.metric++;
  return e;
});

stats = function(selector) {
  return unit({
    emit: function(events, next) {
      var current, e, j, len, value;
      current = null;
      events = events.filter(function(e) {
        return e != null;
      });
      if (events.length === 0) {
        return;
      }
      value = selector(events[0]);
      sum = 0;
      min = value;
      max = value;
      for (j = 0, len = events.length; j < len; j++) {
        e = events[j];
        value = selector(e);
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return next(extend({}, e, {
        time: now(),
        count: events.length,
        sum: sum,
        average: sum / events.length,
        min: min,
        max: max
      }));
    }
  });
};

statstime = function(ms, selector) {
  var add, events, remove;
  events = [];
  sum = 0;
  min = Number.MAX_VALUE;
  max = Number.MIN_VALUE;
  add = function(e) {
    var value;
    events.push(e);
    value = selector(e);
    sum += value;
    min = Math.min(min, value);
    return max = Math.max(max, value);
  };
  remove = function(values) {
    var e, j, l, len, len1, len2, m, recalcmax, recalcmin, results, value;
    recalcmin = false;
    recalcmax = false;
    for (j = 0, len = values.length; j < len; j++) {
      value = values[j];
      sum -= value;
      if (value === min) {
        recalcmin = true;
      }
      if (value === max) {
        recalcmax = true;
      }
    }
    if (recalcmin) {
      min = Number.MAX_VALUE;
      for (l = 0, len1 = events.length; l < len1; l++) {
        e = events[l];
        min = Math.min(min, selector(e));
      }
    }
    if (recalcmin) {
      max = Number.MIN_VALUE;
      results = [];
      for (m = 0, len2 = events.length; m < len2; m++) {
        e = events[m];
        results.push(max = Math.max(max, selector(e)));
      }
      return results;
    }
  };
  return unit({
    emit: function(e, next) {
      var current, item, j, len, toremove;
      current = events.slice();
      events = [];
      toremove = [];
      for (j = 0, len = current.length; j < len; j++) {
        item = current[j];
        if ((e.time - item.time) > ms) {
          toremove.push(item);
        } else {
          events.push(item);
        }
      }
      remove(toremove.map(selector));
      add(e);
      return next(extend({}, e, {
        time: now(),
        count: events.length,
        sum: sum,
        average: sum / events.length,
        min: min,
        max: max
      }));
    },
    copy: function() {
      return statstime(ms, selector);
    }
  });
};

statscount = function(count, selector) {
  var add, events, remove;
  events = [];
  sum = 0;
  min = Number.MAX_VALUE;
  max = Number.MIN_VALUE;
  add = function(e) {
    var value;
    events.push(e);
    value = selector(e);
    sum += value;
    min = Math.min(min, value);
    return max = Math.max(max, value);
  };
  remove = function(values) {
    var e, j, l, len, len1, len2, m, recalcmax, recalcmin, results, value;
    recalcmin = false;
    recalcmax = false;
    for (j = 0, len = values.length; j < len; j++) {
      value = values[j];
      sum -= value;
      if (value === min) {
        recalcmin = true;
      }
      if (value === max) {
        recalcmax = true;
      }
    }
    if (recalcmin) {
      min = Number.MAX_VALUE;
      for (l = 0, len1 = events.length; l < len1; l++) {
        e = events[l];
        min = Math.min(min, selector(e));
      }
    }
    if (recalcmin) {
      max = Number.MIN_VALUE;
      results = [];
      for (m = 0, len2 = events.length; m < len2; m++) {
        e = events[m];
        results.push(max = Math.max(max, selector(e)));
      }
      return results;
    }
  };
  return unit({
    emit: function(e, next) {
      var toremove;
      toremove = events.splice(0, events.length - count);
      remove(toremove.map(selector));
      add(e);
      return next(extend({}, e, {
        time: now(),
        count: events.length,
        sum: sum,
        average: sum / events.length,
        min: min,
        max: max
      }));
    },
    copy: function() {
      return statstime(ms, selector);
    }
  });
};

contexttime = function(ms) {
  var context;
  context = [];
  return unit({
    emit: function(e, next) {
      var events;
      events = [];
      context = context.filter(function(item) {
        if ((e.time - item.time) > ms) {
          return false;
        }
        events.push(item);
        return true;
      });
      context.push(e);
      return next(events);
    },
    copy: function() {
      return contexttime(ms);
    }
  });
};

contextcount = function(count) {
  var events;
  events = [];
  return unit({
    emit: function(e, next) {
      events.push(e);
      next(events);
      if (events.length > count) {
        return events.shift();
      }
    },
    copy: function() {
      return contextcount(count);
    }
  });
};

grouptime = function(ms) {
  var drain, events, handle, kids, res;
  kids = [];
  handle = null;
  events = [];
  drain = function() {
    var j, k, len;
    if (events.length > 0) {
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit(events);
      }
      events = [];
      return handle = setTimeout(drain, ms);
    } else {
      return handle = null;
    }
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    if (handle == null) {
      events = [e];
      handle = setTimeout(drain, ms);
    } else {
      events.push(e);
    }
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = grouptime(ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

groupcount = function(count) {
  var events;
  events = [];
  return unit({
    emit: function(e, next) {
      events.push(e);
      if (events.length === count) {
        next(events);
        return events = [];
      }
    },
    copy: function() {
      return groupcount(count);
    }
  });
};

batch = function(count, ms) {
  var drain, events, handle, kids, res;
  kids = [];
  handle = null;
  events = [];
  drain = function() {
    var j, k, len;
    if (handle != null) {
      clearTimeout(handle);
    }
    if (events.length > 0) {
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit(events);
      }
      events = [];
      return handle = setTimeout(drain, ms);
    } else {
      return handle = null;
    }
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    if (handle == null) {
      events = [e];
      handle = setTimeout(drain, ms);
    } else {
      events.push(e);
    }
    if (events.length === count) {
      drain();
    }
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = batch(count, ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

sampletime = function(ms) {
  var last;
  last = null;
  return unit({
    emit: function(e, next) {
      if (last == null) {
        last = e.time;
        return;
      }
      if (e.time - last > ms) {
        next(e);
        return last = e.time;
      }
    },
    copy: function() {
      return sampletime(ms);
    }
  });
};

samplecount = function(count) {
  var index;
  index = 0;
  return unit({
    emit: function(e, next) {
      index++;
      if (index === count) {
        next(e);
        return index = 0;
      }
    },
    copy: function() {
      return samplecount(count);
    }
  });
};

changed = function(selector, initial) {
  var previous;
  previous = initial;
  return unit({
    emit: function(e, next) {
      var current;
      current = selector(e);
      if (previous !== current) {
        next(e);
      }
      return previous = current;
    },
    copy: function() {
      return changed(selector, initial);
    }
  });
};

settle = function(ms) {
  var drain, event, handle, kids, res;
  kids = [];
  handle = null;
  event = null;
  drain = function() {
    var j, k, len;
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      k.emit(event);
    }
    event = null;
    return handle = null;
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    if (handle != null) {
      clearTimeout(handle);
    }
    event = e;
    handle = setTimeout(drain, ms);
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = settle(ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

stable = function(ms, selector, initial) {
  var event, kids, previous, res;
  previous = initial;
  kids = [];
  event = null;
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var current, j, k, len;
    if ((event != null) && e.time - event.time > ms) {
      event = null;
    }
    if (event === null) {
      event = e;
      previous = selector(e);
      return;
    }
    current = selector(e);
    if (previous === current) {
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit(e);
      }
      return;
    }
    previous = current;
    event = e;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = stable(ms, selector);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

debounce = function(ms) {
  var last;
  last = null;
  return unit({
    emit: function(e, next) {
      if (last == null) {
        last = e.time;
        return next(e);
      } else if (e.time - last > ms) {
        last = e.time;
        return next(e);
      }
    },
    copy: function() {
      return debounce(ms);
    }
  });
};

combine = function(streams) {
  var j, kids, len, res, s;
  kids = [];
  for (j = 0, len = streams.length; j < len; j++) {
    s = streams[j];
    s({
      emit: function(e) {
        return res.emit(e);
      }
    });
  }
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var k, l, len1;
    for (l = 0, len1 = kids.length; l < len1; l++) {
      k = kids[l];
      k.emit(e);
    }
    return null;
  };
  res.copy = function() {
    var k, l, len1, twin;
    twin = combine(streams);
    for (l = 0, len1 = kids.length; l < len1; l++) {
      k = kids[l];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

split = function(selector) {
  var kids, res, streams;
  kids = [];
  streams = {};
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var j, k, len, ref, value;
    value = selector(e);
    if (streams[value] == null) {
      streams[value] = kids.map(function(k) {
        return k.copy();
      });
    }
    ref = streams[value];
    for (j = 0, len = ref.length; j < len; j++) {
      k = ref[j];
      k.emit(e);
    }
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = split(selector);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

compose = function(sequence) {
  var i, j, ref, res;
  if (sequence.length === 0) {
    return stream;
  }
  res = sequence[sequence.length - 1];
  for (i = j = ref = sequence.length - 2; ref <= 0 ? j <= 0 : j >= 0; i = ref <= 0 ? ++j : --j) {
    res = sequence[i](res);
  }
  return res;
};

pipe = function(sequence) {
  var i, j, ref, res;
  if (sequence.length === 0) {
    return stream;
  }
  res = sequence[0];
  for (i = j = 1, ref = sequence.length; 1 <= ref ? j < ref : j > ref; i = 1 <= ref ? ++j : --j) {
    res = sequence[i](res);
  }
  return res;
};

every = function(kids) {
  var res;
  kids = kids.slice();
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var j, k, len;
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      k.emit(e);
    }
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = every([]);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

coalesce = function(selector, ms) {
  var drain, handle, kids, lake, res;
  kids = [];
  handle = null;
  lake = {};
  drain = function() {
    var current, e, events, j, k, key, len;
    current = now();
    events = [];
    for (key in lake) {
      e = lake[key];
      if ((e.ttl == null) || e.time + e.ttl < current) {
        events.push(extend({}, e, {
          state: 'expired'
        }));
        delete lake[key];
        continue;
      }
      events.push(e);
    }
    if (events.length > 0) {
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit(events);
      }
      return handle = setTimeout(drain, ms);
    } else {
      return handle = null;
    }
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    if ((e != null ? e.state : void 0) === 'expired') {
      return;
    }
    lake[selector(e)] = e;
    if (handle == null) {
      handle = setTimeout(drain, ms);
    }
    return null;
  };
  res.get = function(key) {
    return lake[key];
  };
  res.each = function(fn) {
    var e, key, results;
    results = [];
    for (key in lake) {
      e = lake[key];
      results.push(fn(e));
    }
    return results;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = coalesce(selector, ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

project = function(predicates) {
  var events, kids, res;
  kids = [];
  events = predicates.map(function(predicate) {
    return null;
  });
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var index, j, k, l, len, len1, predicate;
    for (index = j = 0, len = predicates.length; j < len; index = ++j) {
      predicate = predicates[index];
      if (predicate(e)) {
        events[index] = e;
      }
    }
    for (l = 0, len1 = kids.length; l < len1; l++) {
      k = kids[l];
      k.emit(events);
    }
    events = events.map(function(item) {
      if ((item == null) || (item.ttl == null) || item.time + item.ttl < e.time) {
        return null;
      }
      return item;
    });
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = project(predicates);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

rollup = function(count, ms) {
  var drain, events, handle, kids, res;
  kids = [];
  handle = null;
  events = [];
  drain = function() {
    var j, k, len;
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      k.emit(events);
    }
    events = [];
    return handle = null;
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var j, k, len;
    if (handle != null) {
      events.push(e);
      return;
    }
    events.push(e);
    events = events.filter(function(item) {
      return (e.time - item.time) < ms;
    });
    if (events.length <= count) {
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit([e]);
      }
      return;
    }
    handle = setTimeout(drain, ms + events[0].time - e.time);
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = rollup(count, ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

apdex = function(issatisfied, istolerated, ms) {
  var drain, events, handle, kids, res;
  kids = [];
  handle = null;
  events = [];
  drain = function() {
    var e, item, j, k, l, len, len1;
    if (events.length === 0) {
      handle = null;
      return;
    }
    e = extend({}, events[events.length - 1]);
    e.time = now();
    e.satisfied = 0;
    e.tolerated = 0;
    for (j = 0, len = events.length; j < len; j++) {
      item = events[j];
      if (issatisfied(item)) {
        e.satisfied++;
      } else if (istolerated) {
        e.tolerated++;
      }
    }
    e.apdex = (e.satisfied + e.tolerated / 2) / events.length;
    for (l = 0, len1 = kids.length; l < len1; l++) {
      k = kids[l];
      k.emit(e);
    }
    events = [];
    return handle = setTimeout(drain, ms);
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    if ((e != null ? e.state : void 0) === 'expired') {
      return;
    }
    events.push(e);
    if (handle == null) {
      handle = setTimeout(drain, ms);
    }
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = apdex(count, ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

flatten = unit({
  emit: function(events, next) {
    var e, j, len, results;
    if (!Array.isArray(events)) {
      next(events);
      return;
    }
    results = [];
    for (j = 0, len = events.length; j < len; j++) {
      e = events[j];
      results.push(next(e));
    }
    return results;
  }
});

throttle = function(count, ms) {
  var drain, events, handle, kids, res;
  kids = [];
  handle = null;
  events = [];
  drain = function() {
    events = [];
    return handle = null;
  };
  res = function(k) {
    kids.push(k);
    return res;
  };
  res.emit = function(e) {
    var j, k, len;
    if (handle != null) {
      events.push(e);
      return;
    }
    events.push(e);
    events = events.filter(function(item) {
      return (e.time - item.time) < ms;
    });
    if (events.length <= count) {
      for (j = 0, len = kids.length; j < len; j++) {
        k = kids[j];
        k.emit(e);
      }
      return;
    }
    handle = setTimeout(drain, ms + events[0].time - e.time);
    return null;
  };
  res.copy = function() {
    var j, k, len, twin;
    twin = throttle(count, ms);
    for (j = 0, len = kids.length; j < len; j++) {
      k = kids[j];
      twin(k.copy());
    }
    return twin;
  };
  return res;
};

log = unit({
  emit: function(e, next) {
    console.log(e);
    return next(e);
  }
});

error = unit({
  emit: function(e, next) {
    console.error(e);
    return next(e);
  }
});

result = compose;

result.extend = extend;

result.unit = unit;

result.log = log;

result.error = error;

result.now = now;

result.milliseconds = result.ms = function(n) {
  return n;
};

result.seconds = result.s = function(n) {
  return 1000 * result.ms(n);
};

result.minutes = result.m = function(n) {
  return 60 * result.m(n);
};

result.hours = result.h = function(n) {
  return 60 * result.m(n);
};

result.days = result.d = function(n) {
  return 24 * result.h(n);
};

result.stream = stream;

result.filter = filter;

result.tagged = tagged;

result.taggedany = taggedany;

result.taggedall = taggedall;

result.each = each;

result.copy = copy;

result.map = map;

result.run = run;

result.reduce = reduce;

result.max = max;

result.min = min;

result.sum = sum;

result.count = count;

result.stats = stats;

result.statstime = statstime;

result.statscount = statscount;

result.contexttime = contexttime;

result.contextcount = contextcount;

result.grouptime = grouptime;

result.groupcount = groupcount;

result.batch = batch;

result.coalesce = coalesce;

result.project = project;

result.rollup = rollup;

result.apdex = apdex;

result.flatten = flatten;

result.sampletime = sampletime;

result.samplecount = samplecount;

result.changed = changed;

result.settle = settle;

result.stable = stable;

result.debounce = debounce;

result.throttle = throttle;

result.combine = combine;

result.split = split;

result.compose = compose;

result.pipe = pipe;

result.every = every;

module.exports = result;
