function fetchStuff () {
  return Promise.all([
    fetch(new URL('./storage-room.txt', import.meta.url))
      .then(r => r.text()),
    fetch('https://unpkg.com/minecraft-textures/dist/textures/json/1.16.json')
      .then(r => r.json())
  ])
}

export function findItemBy (textures, value, prop = 'id') {
  return textures.find(entry => entry[prop] === value)
}

// Note: Z goes upwards
const setblockRegex = /^\/setblock -\d+ \d+ -(\d+) minecraft:(\w+)/
const spaceRegex = /^\[(some|\d+) spaces?(?: to \/setblock -?\d+ \d+ -?(\d+)[^\]]*)?\]/
const unstackableRegex = /^([A-Z0-9]) ([^:]+): (.+)$/

const armour = 'helmet chestplate leggings boots'.split(' ')
const tools = 'sword shovel pickaxe hoe axe'.split(' ')

export async function prepare () {
  const [text, { items: textures }] = await fetchStuff()

  const stackables = {}
  const unstackables = {}
  const data = {}
  let mode = null
  let submode = null
  function noZIsNowKnown (z) {
    for (let i = 0; i < submode.noZ.length; i++) {
      if (submode.noZ[i]) {
        submode.pairs.push([i - submode.noZ.length + z, submode.noZ[i]])
      }
    }
    submode.noZ = []
  }
  let lineNum = 0
  for (const line of text.split(/\r?\n/)) {
    lineNum++
    if (!line) {
      continue
    } else if (line[0] === '#') {
      continue
    } else if (line[0] === '@') {
      if (line === '@/') {
        mode = null
        for (const [, blockId] of submode.pairs) {
          if (!findItemBy(textures, blockId)) {
            console.warn(`${blockId} is not a valid item tag.`)
          }
        }
        stackables[submode.name] = submode.pairs
        submode = null
      } else {
        mode = 'stackables'
        submode = { name: line.slice(1), z: null, noZ: [], pairs: [] }
      }
    } else if (line[0] === '!') {
      if (line === '!/') {
        mode = null
      } else {
        mode = 'unstackables'
      }
    } else if (line[0] === '$') {
      if (line[1] === '!') {
        const [name, ...groups] = line.slice(2).split(';')
        data[name] = []
        for (const group of groups) {
          data[name].push(Array.from(group, char => unstackables[char]))
        }
      } else if (line[1] === '#') {
        const [name, value] = line.slice(2).split(';')
        data[name] = +value
      } else {
        const [name, value] = line.slice(1).split(';')
        data[name] = value
      }
    } else if (mode === 'stackables') {
      const match = line.match(setblockRegex)
      if (match) {
        const [, zStr, blockTag] = match
        const z = +zStr
        if (submode.z !== null && z !== submode.z + 1) {
          console.warn(`May have skipped a z around ${blockTag}? Expecting z=${submode.z + 1}, got z=${z}`)
        }
        if (submode.z === null) {
          noZIsNowKnown(z)
        }
        submode.z = z
        submode.pairs.push([z, `minecraft:${blockTag}`])
      } else {
        const match = line.match(spaceRegex)
        if (match) {
          const [, spaces, zStr] = match
          if (spaces === 'some') {
            if (zStr) {
              const z = +zStr
              if (submode.z === null) {
                noZIsNowKnown(z)
              }
              submode.z = z
            } else if (submode.z === null) {
              if (submode.noZ.length > 0) {
                console.warn(`Do not know the number of spaces by line ${lineNum}; discarding blocks before.`)
              }
              submode.noZ = []
            } else {
              submode.z = null
            }
          } else {
            const spacesNum = +spaces
            if (submode.z === null) {
              for (let i = spacesNum; i--;) submode.noZ.push(null)
            } else {
              submode.z += spacesNum
            }
          }
        } else if (submode.z === null) {
          submode.noZ.push(`minecraft:${line}`)
        } else {
          submode.z++
          submode.pairs.push([submode.z, `minecraft:${line}`])
        }
      }
    } else if (mode === 'unstackables') {
      const match = line.match(unstackableRegex)
      if (match) {
        const [, id, name, tags] = match
        const itemIds = []
        for (const tag of tags.split(', ')) {
          if (tag.includes('{*ARMOUR}')) {
            for (const armourPiece of armour) {
              itemIds.push('minecraft:' + tag.replace('{*ARMOUR}', armourPiece))
            }
          } else if (tag.includes('{*TOOLS}')) {
            for (const tool of tools) {
              itemIds.push('minecraft:' + tag.replace('{*TOOLS}', tool))
            }
          } else if (tag.includes('*')) {
            const start = 'minecraft:' + tag.slice(0, tag.indexOf('*'))
            const end = tag.slice(tag.indexOf('*') + 1)
            for (const { id } of textures) {
              if (id.startsWith(start) && id.endsWith(end)) {
                itemIds.push(id)
              }
            }
          } else {
            itemIds.push('minecraft:' + tag)
          }
        }
        unstackables[id] = { name, items: itemIds }
      }
    }
  }
  for (const { items } of Object.values(unstackables)) {
    for (const item of items) {
      if (!findItemBy(textures, item)) {
        console.warn(`${item} is not a valid item tag.`)
      }
    }
  }

  return {
    textures,
    stackables,
    data
  }
}
