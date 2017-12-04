{ flow } = require './'

s1 = flow.stream()
s2 = flow.stream()
s3 = flow.combine [s1, s2]

s3(
  flow.rollup(5, flow.seconds 10)(
      flow.log))

emit1 = ->
  s1.emit
    time: flow.now()
    host: 'api1'
    service: 'web'
setInterval emit1, flow.seconds 1
emit2 = ->
  s1.emit
    time: flow.now()
    host: 'api2'
    service: 'web'
setInterval emit2, flow.seconds 3
