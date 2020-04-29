const SparseArray = require('./sparsearray')
const { BitArray } = require('./bitarray')
const RangeSingle = require('./range_single')
const RangeMultiple = require('./range_multiple')
const SetSingle = require('./set_single')
const SetMultiple = require('./set_multiple')
const Link = require('./link')
const DuplexLink = require('./duplex_link')
const LinkFilter = require('./linkfilter')
const text = require('./text')
const Hub = require('../lib/hub')

const visit = async (cube, fn) => {
  const seen = new Set()
  const tovisit = new Set([cube])
  while (tovisit.size > 0) {
    const visiting = Array.from(tovisit)
    tovisit.clear()
    for (const current of visiting) {
      seen.add(current)
      await fn(current)
      for (const forward of current.forward.keys())
        if (!seen.has(forward)) tovisit.add(forward)
    }
  }
}

module.exports = identity => {
  const hub = Hub()
  const data = new Map()
  const lookup = new Map()
  const index = new SparseArray()
  const filterbits = new BitArray()
  const dimensions = []
  const internal_dimensions = []

  const forward_links = []
  const backward_links = []
  const forward = new Map()
  const backward = new Map()
  const mark = []

  const i2d = i => data.get(index.get(i))
  const i2id = i => index.get(i)
  const id2d = id => data.get(id)
  const id2i = id => lookup.get(id)

  const onfiltered = async ({ bitindex, put, del }) => {
    if (put.length == 0 && del.length == 0) return

    const diff = { put: [], del: [] }
    let shouldrecalc = false

    for (const i of del) {
      filterbits[bitindex.offset][i] |= bitindex.one
      if (filterbits.only(i, bitindex.offset, bitindex.one))
        diff.del.push(i)
    }
    for (const i of put) {
      if (filterbits.only(i, bitindex.offset, bitindex.one))
        diff.put.push(i)
      if (filterbits.onlyExcept(i, api.linkfilter.bitindex.offset, ~api.linkfilter.bitindex.one, bitindex.offset, bitindex.one))
        shouldrecalc = true
      filterbits[bitindex.offset][i] &= ~bitindex.one
    }

    await hub.emit('filter changed', { bitindex, put, del })
    await hub.emit('selection changed', {
      put: diff.put.map(i2d),
      del: diff.del.map(i2d)
    })

    const applydel = async (cube, del) => {
      for (const [target, dimension] of cube.forward.entries()) {
        const changes = await dimension({ del: del.map(cube.i2id) })
        if (changes.del.length > 0) {
          await target.linkfilter({ del: changes.del })
        }
      }
    }

    if (shouldrecalc) {
      await visit(api, async cube => {
        for (const [target, dimension] of cube.forward.entries()) {
          const changes = await dimension.reset()
          if (changes.length > 0)
            await target.linkfilter({ put: changes })
        }
      })
      await visit(api, async cube => {
        await applydel(cube, Array.from(cube.hiddenindicies()))
      })
      return
    }
    else if (diff.del.length > 0)
      await applydel(api, diff.del)
  }

  const createlink = (source, map) => {
    if (source.forward.has(api))
      throw new Error('Cubes are already linked')
    const dimension = Link(api, map)
    dimensions.push(dimension)
    dimension.on('filter changed', p => onfiltered(p))
    source.forward.set(api, dimension)
    api.backward.set(source, dimension)
    dimension.source = source
    return dimension
  }

  const api = {
    i2d,
    i2id,
    id2d,
    id2i,
    identity,
    print: () => api.identity.toString().split(' => ')[0],
    // trace: p => hub.emit('trace', p),
    on: (...args) => hub.on(...args),
    length: () => index.length(),
    filterbits,
    index,
    forward,
    backward,
    mark,
    dimensions,
    onfiltered,
    forward_links,
    backward_links,
    range_single: map => {
      const dimension = RangeSingle(api, map)
      dimensions.push(dimension)
      internal_dimensions.push(dimension)
      dimension.on('filter changed', p => onfiltered(p))
      // dimension.on('trace', p => hub.emit('trace', p))
      return dimension
    },
    range_multiple: map => {
      const dimension = RangeMultiple(api, map)
      dimensions.push(dimension)
      internal_dimensions.push(dimension)
      dimension.on('filter changed', p => onfiltered(p))
      // dimension.on('trace', p => hub.emit('trace', p))
      return dimension
    },
    range_multiple_text: (map, stemmer) => {
      const map_text = d => text.default_process(map(d)).map(stemmer)
      const dimension = RangeMultiple(api, map_text)
      dimensions.push(dimension)
      internal_dimensions.push(dimension)
      dimension.on('filter changed', p => onfiltered(p))
      // dimension.on('trace', p => hub.emit('trace', p))
      const search = (lo, hi) => {
        if (lo) lo = stemmer(lo)
        if (hi) hi = stemmer(hi)
        return dimension(lo, hi)
      }
      for (const key of Object.keys(dimension))
        search[key] = dimension[key]
      return search
    },
    set_single: map => {
      const dimension = SetSingle(api, map)
      dimensions.push(dimension)
      internal_dimensions.push(dimension)
      dimension.on('filter changed', p => onfiltered(p))
      // dimension.on('trace', p => hub.emit('trace', p))
      return dimension
    },
    set_multiple: map => {
      const dimension = SetMultiple(api, map)
      dimensions.push(dimension)
      internal_dimensions.push(dimension)
      dimension.on('filter changed', p => onfiltered(p))
      // dimension.on('trace', p => hub.emit('trace', p))
      return dimension
    },
    link: (source, map) => {
      return DuplexLink(api, source, map)
    },
    backward_link: (source, map) => {
      const dimension = createlink(source, map)
      backward_links.push(dimension)
      return dimension
    },
    forward_link: (source, map) => {
      const dimension = createlink(source, map)
      forward_links.push(dimension)
      return dimension
    },
    batch_calculate_link_change: async ({ indicies, put, del }) => {
      for (const d of backward_links) await d.batch(indicies, put, del)
    },
    batch_calculate_selection_change: async ({ put, del }) => {
      if (put.length == 0 && del.length == 0) return
      const changes = { put: [], del: [] }
      const linkchanges = { put: [], del: [] }
      for (const [i, d] of del) {
        changes.del.push(d)
        linkchanges.del.push(i2id(i))
      }
      for (const [i, d] of put) {
        if (filterbits.zero(i)) {
          changes.put.push(d)
          linkchanges.put.push(i2id(i))
        }
      }
      await hub.emit('selection changed', changes)
      for (const [cube, link] of forward.entries()) {
        const diff = await link(linkchanges)
      }
    },
    batch: async ({ put = [], del = [] }) => {
      const del_ids = []
      for (const d of del) {
        const id = identity(d)
        if (!data.has(id)) continue
        del_ids.push(id)
        delete data.delete(id)
      }
      const put_ids = []
      for (const d of put) {
        const id = identity(d)
        if (data.has(id)) throw new Error('Put with id already in dataset')
        put_ids.push(id)
        data.set(id, d)
      }
      const indicies = index.batch({ put: put_ids, del: del_ids })
      const result = {
        selection_change: {
          put: indicies.put.map(i => {
            lookup.set(i2id(i), i)
            return [i, i2d(i)]
          }),
          del: indicies.del.map((i, index) => {
            lookup.delete(i2id(i))
            return [i, del[index]]
          })
        },
        link_change: { indicies, put, del }
      }
      filterbits.lengthen(index.length())
      const existing = mark.length
      mark.length = index.length()
      for (const i of indicies.put) filterbits.clear(i)
      for (const d of internal_dimensions) d.batch(indicies, put, del)
      for (const d of forward_links) d.batch(indicies, put, del)
      await hub.emit('batch', { indicies, put, del })
      return result
    }
  }
  api.linkfilter = LinkFilter(api)
  dimensions.push(api.linkfilter)
  internal_dimensions.push(api.linkfilter)
  api.linkfilter.on('filter changed', p => onfiltered(p))
  // api.linkfilter.on('trace', p => hub.emit('trace', p))
  const iterate = fn => function*() {
    const iterator = index[Symbol.iterator]()
    let i = iterator.next()
    while (!i.done) {
      if (fn(i.value)) yield i2d(i.value)
      i = iterator.next()
    }
  }
  api.highlighted = iterate(i => filterbits.zero(i))
  api.filtered = iterate(i => filterbits.zero(i))
  api.unfiltered = iterate(i => true)
  api.hiddenindicies = function*() {
    const iterator = index[Symbol.iterator]()
    let i = iterator.next()
    while (!i.done) {
      if (filterbits.zeroExcept(i.value, api.linkfilter.bitindex.offset, ~api.linkfilter.bitindex.one)) {
        i = iterator.next()
        continue
      }
      yield i.value
      i = iterator.next()
    }
  }
  return api
}