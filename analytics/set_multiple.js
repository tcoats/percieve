const SparseArray = require('./sparsearray')
const Hub = require('../lib/hub')

module.exports = (cube, map) => {
  const _set = new Map()
  let autoexpand = true
  const filter = new Set()
  let shownulls = true
  const nulls = new Set()

  const hub = Hub()
  const bitindex = cube.filterbits.add()
  const filterindex = new SparseArray()

  const api = async ({ put = [], del = [] }) => {
    // console.log(
    //   '   set_multiple',
    //   put.length.toString().padStart(5, ' ') + ' ↑',
    //   del.length.toString().padStart(5, ' ') + ' ↓   ',
    //   map.toString()
    // )
    if (del.length > 0) autoexpand = false
    const indexdiff = { put: new Set(), del: new Set() }
    for (const key of del) {
      if (!_set.has(key) || !filter.has(key)) continue
      filter.delete(key)
      for (const index of _set.get(key).keys()) {
        const current = filterindex.get(index)
        if (current === 1) indexdiff.del.add(index)
        filterindex.set(index, current - 1)
      }
    }
    for (const key of put) {
      if (!_set.has(key) || filter.has(key)) continue
      filter.add(key)
      for (const index of _set.get(key).keys()) {
        const current = filterindex.get(index)
        if (current === 0) {
          if (indexdiff.del.has(index))
            indexdiff.del.delete(index)
          else indexdiff.put.add(index)
        }
        filterindex.set(index, current + 1)
      }
    }
    await hub.emit('filter changed', {
      bitindex,
      put: Array.from(indexdiff.put),
      del: Array.from(indexdiff.del)
    })
  }
  api.lookup = key =>
    !_set.has(key) ? []
    : Array.from(
      _set.get(key).keys(),
      i => cube.index.get(i))
  api.shownulls = async () => {
    if (shownulls) return
    shownulls = true
    await hub.emit('filter changed', {
      bitindex,
      del: [],
      put: Array.from(nulls.values())
    })
  }
  api.hidenulls = async () => {
    if (!shownulls) return
    shownulls = false
    await hub.emit('filter changed', {
      bitindex,
      del: Array.from(nulls.values()),
      put: []
    })
  }
  api.autoexpand = () => autoexpand
  api.bitindex = bitindex
  api.on = hub.on
  api.filter = filter
  api.keys = () => Array.from(_set.keys(), key => [key, filter.has(key)])
  api.keys_size = () => _set.size
  api.selectall = async () => {
    autoexpand = true
    const indexdiff = { put: new Set(), del: new Set() }
    for (const key of _set.keys()) {
      if (filter.has(key)) continue
      filter.add(key)
      for (const index of _set.get(key).keys()) {
        const current = filterindex.get(index)
        if (current === 0) {
          if (indexdiff.del.has(index))
            indexdiff.del.delete(index)
          else indexdiff.put.add(index)
        }
        filterindex.set(index, current + 1)
      }
    }
    await hub.emit('filter changed', {
      bitindex,
      put: Array.from(indexdiff.put),
      del: Array.from(indexdiff.del)
    })
  }
  api.selectnone = async () => {
    autoexpand = false
    const indexdiff = { put: new Set(), del: new Set() }
    for (const key of _set.keys()) {
      if (!filter.has(key)) continue
      for (const index of _set.get(key).keys()) {
        const current = filterindex.get(index)
        if (current === 0) {
          if (indexdiff.del.has(index))
            indexdiff.del.delete(index)
          else indexdiff.put.add(index)
        }
        filterindex.set(index, current + 1)
      }
    }
    filter.clear()
    await hub.emit('filter changed', {
      bitindex,
      put: Array.from(indexdiff.put),
      del: Array.from(indexdiff.del)
    })
  }
  const iterate = fn => function*(n) {
    if (n === 0) return
    const keys = n > 0 ? _set.keys() : Array.from(_set.keys()).reverse()
    const keyiterator = keys[Symbol.iterator]()
    while (n > 0) {
      const key = keyiterator.next()
      if (key.done) break
      const indexiterator = _set.get(key.value)[Symbol.iterator]()
      while (n > 0) {
        const index = indexiterator.next()
        if (index.done) break
        if (fn(index.value)) {
          yield [key.value, cube.i2d(index.value)]
          n--
        }
      }
    }
    const nulliterator = nulls[Symbol.iterator]()
    while (n > 0) {
      const item = nulliterator.next()
      if (item.done) break
      if (fn(item.value)) {
        yield [null, cube.i2d(item.value)]
        n--
      }
    }
  }
  api.filtered = iterate(
    i => cube.filterbits.zero(i))
  api.context = iterate(
    i => cube.filterbits.zeroExcept(i, bitindex.offset, ~bitindex.one))
  api.unfiltered = iterate(
    i => true)
  api.batch = (dataindicies, put, del) => {
    // console.log(
    //   '   set_multiple',
    //   put.length.toString().padStart(5, ' ') + ' ↑',
    //   del.length.toString().padStart(5, ' ') + ' ↓   ',
    //   map.toString()
    // )
    filterindex.length(Math.max(...dataindicies.put) + 1)
    const diff = { put: [], del: [] }
    del.forEach((d, i) => {
      const keys = map(d) || []
      const index = dataindicies.del[i]
      if (keys.length == 0) {
        nulls.delete(index)
        if (shownulls) diff.del.push(index)
        return
      }
      let count = 0
      for (const key of keys) {
        if (filter.has(key)) count++
        _set.get(key).delete(index)
      }
      if (count > 0) diff.del.push(index)
      filterindex.remove(index)
    })
    put.forEach((d, i) => {
      const keys = map(d) || []
      const index = dataindicies.put[i]
      if (keys.length == 0) {
        nulls.add(index)
        if (shownulls) diff.put.push(index)
        return
      }
      let count = 0
      for (const key of keys) {
        if (!_set.has(key)) _set.set(key, new Set())
        _set.get(key).add(index)
        if (autoexpand) {
          filter.add(key)
          count++
        }
        else if (filter.has(key)) count++
      }
      if (count > 0) diff.put.push(index)
      filterindex.set(index, count)
    })
    for (const i of diff.del)
      cube.filterbits[bitindex.offset][i] |= bitindex.one
    for (const i of diff.put)
      cube.filterbits[bitindex.offset][i] &= ~bitindex.one
    hub.emit('batch', { put, del, diff })
    return diff
  }
  return api
}