class Sector {
	constructor(scope) {
		let {name, tasks={}, spawnQueue=[], spawnHash={}, eventFlags={}, level=0, setup=false} = scope

		this.name = name

		this.tasks = tasks

		this.spawnQueue = spawnQueue
		this.spawnHash = spawnHash

		this.eventFlags = eventFlags
		this.level = level
		this.setup = setup

		return this
	}

	// Setup
	init() {
		let spawnLocation = _.first(Game.rooms[this.name].find(FIND_MY_SPAWNS)).pos
		let targetRoom = Game.rooms[this.name]

		let controllerPath = targetRoom.findPath(spawnLocation, targetRoom.controller.pos, {ignoreCreeps: true, range: 1})
		let containerPos = new RoomPosition(controllerPath[controllerPath.length-2].x, controllerPath[controllerPath.length-2].y, this.name)
		let linkPos = new RoomPosition(controllerPath[controllerPath.length-3].x, controllerPath[controllerPath.length-3].y, this.name)

		let upgradeTaskInfo = {
			controllerID:		targetRoom.controller.id,
			controllerPos:		RoomPosition.serialize(targetRoom.controller.pos),
			desiredThroughput:	15,
			containerPos:		RoomPosition.serialize(containerPos),
			linkPos:			RoomPosition.serialize(linkPos),
			static:				true
		}
		let upgradeTask = new TASKS.UPGRADING({
			sectorName:		this.name,
			id:				makeID(),
			taskInfo:		upgradeTaskInfo
		})
		this.addTask(upgradeTask)

		let sources = Game.rooms[this.name].find(FIND_SOURCES)
		for (let sourceIdx in sources) {
			let targetSource = sources[sourceIdx]

			let fromPos = spawnLocation
			let path = targetRoom.findPath(fromPos, targetSource.pos, {ignoreCreeps: true, range: 1})

			let taskInfo = {
				sourceID:	targetSource.id,
				sourcePos:	RoomPosition.serialize(targetSource.pos),
				sourceAmt:	targetSource.energyCapacity,
				path:		Room.serializePath(path),
				pathLength:	path.length,
				standPos:	RoomPosition.serialize(new RoomPosition(_.last(path).x, _.last(path).y, targetSource.pos.roomName)),
				originPos:	RoomPosition.serialize(fromPos)
			}

			let newTask = new TASKS.MINING({
				sectorName: 	this.name,
				id:				makeID(),
				taskInfo:		taskInfo,
				priorityOffset:	path.length,
				unloadOrder:	[RoomPosition.serialize(spawnLocation), RoomPosition.serialize(containerPos)]
			})
			this.addTask(newTask)
		}
	}

	run() {
		let satisfaction = this.runTasks()
		if (satisfaction == 0) {
			// Do we already have a SCOUTING task?
			let scoutTask = _.find(this.tasks, s => s.type == 'SCOUTING')
			// if (!scoutTask) {
			// 	// Lets make a scout task
			// 	let newTask = 
			// }
		}
		this.runSpawns()

		if (global[`PLANNER_${this.name}`]) {
			this.plan()
		}
	}

	// Fancy
	draw() {
		console.log('drawing')
		let newVisual = new RoomVisual(this.name).text(`${this.name}\tTest`, 24, 10, {
			'font':		'30px',
			'color':	'#FFFFFF',
			'stroke':	'#000000',
			'align':	'center',
			'opacity': 	0.8,
			'backgroundColor':		'#777777',
			'backgroundPadding':	0.5
		})
	}

	// Tasks
	addTask(task) {
		Imperium.sectors[this.name].tasks[task.id] = task
	}
	runTasks() {
		let satisfaction = 0

		for (let taskID in this.tasks) {
			let task = Imperium.sectors[this.name].tasks[taskID]

			// Check to see if we've been initialized
			if (!_.has(task.taskInfo, 'init')) {
				Imperium.sectors[this.name].tasks[taskID].taskInfo['init'] = true
				Imperium.sectors[this.name].tasks[taskID].init()
			}

			Imperium.sectors[this.name].tasks[taskID].run()
			satisfaction = Math.max(Imperium.sectors[this.name].tasks[taskID].satisfaction, satisfaction)
		}

		return satisfaction
	}

	// Spawning
	addCreep(scope) {
		let {creepName, creepBody, memObject, priority} = scope

		// Hash exists for quick lookups
		if (_.has(this.spawnHash, creepName)) {
			return false
		}

		memObject['home'] = this.name

		let creepObj = {
			body:		creepBody,
			memory:		memObject,
			name:		creepName,
			priority:	priority
		}

		this.spawnQueue.push(creepObj)
		this.spawnHash[creepName] = 0

		return true
	}
	runSpawns() {

		// Make sure we have something in the queue
		if (this.spawnQueue.length == 0) {
			return
		}

		// Group creeps by task type, sorted by basePriority
		// Take creep from lowest basePriority then (if multiple tasks) lowest priorityOffset
		let thisTasks = this.tasks
		this.spawnQueue = _.sortByAll(this.spawnQueue, function(s) {
			let task = thisTasks[s.memory.taskID]

			let basePriority = TASKS.Task.basePriorities[task.type]
			let priorityOffset = task.priorityOffset
			let creepPriority = s.priority

			return [basePriority, priorityOffset, creepPriority]
		})

		let availableSpawns = _.filter(Game.rooms[this.name].find(FIND_MY_STRUCTURES), s => s.structureType == STRUCTURE_SPAWN && !s.spawning)
		for (let spawnIdx in availableSpawns) {
			let spawner = availableSpawns[spawnIdx]

			// Make sure we're not processing more creeps than we have in the queue
			if (this.spawnQueue.length <= spawnIdx) {
				return
			}

			let targetCreep = this.spawnQueue[spawnIdx]
			let spawnCheck = spawner.createCreep(targetCreep.body, targetCreep.name, targetCreep.memory)
			let illegalErrors = [-1, -10, -14]
			let popErrors = [-3]

			if (illegalErrors.includes(spawnCheck)) {
				console.log(`${targetCreep.name} can't spawn in ${this.name}\t${spawnCheck}`)
				continue
			}
			if (popErrors.includes(spawnCheck)) {
				this.spawnQueue.shift()
				delete this.spawnHash[targetCreep.name]
			}
			let warnErrors = [-4, -6]
			if (warnErrors.includes(spawnCheck)) {
				continue
			}

			// Remove from spawn hash and queue
			this.spawnQueue.shift()
			delete this.spawnHash[targetCreep.name]
		}
	}

	plan() {
		let id = `PLANNER_${this.name}`

		// Did we just call plan for the first time?
		if (!global[id]) {
			console.log(`Starting planning process for ${this.name}`)
			// progress bar?
			global[id] = {
				generator: 	this._plan(),
				persist: 	{}
			}
		}

		let prevCPU = Game.cpu.getUsed()
		let yieldObj = global[id].generator.next()
		let used = Game.cpu.getUsed() - prevCPU
		console.log(used.toFixed(3))
		if (yieldObj.done) {
			console.log(`${this.name} finished room planning`)
			Imperium.sectors[this.name].planInfo = yieldObj.value
			
			RoomVisual.drawPositions(yieldObj.value['wallSpots'], this.name)
			RoomVisual.drawGrid(PathFinder.CostMatrix.deserialize(yieldObj.value['interior']), this.name, {text: false, cutoffMin: 0, cutoffMax: 255})

			delete global[id]
		}
	}
	*_plan() {
		let persists = {}
		let outObj = {}

		let roomObj = Game.rooms[this.name]
		let roomTerrain = roomObj.getTerrain()

		let getDistanceWalls = function() {
			let distanceWalls = new PathFinder.CostMatrix

			for (let y = 0; y < 50; y += 1) {
				for (let x = 0; x < 50; x += 1) {
					let terrainAt = roomTerrain.get(x, y)
					
					// Are we a wall?
					if (terrainAt == TERRAIN_MASK_WALL) {
						distanceWalls.set(x, y, 0)
					}

					// Otherwise, do distanceWall calculation
					else {
						let toInclude = []
						if (y-1 >= 0) {
							toInclude.push(distanceWalls.get(x  , y-1))
							if (x-1 >= 0) {
								toInclude.push(distanceWalls.get(x-1, y-1))
							}
							if (x+1 < 50) {
								toInclude.push(distanceWalls.get(x+1, y-1))
							}
						}
						if (x-1 >= 0) {
							toInclude.push(distanceWalls.get(x-1, y  ))
						}
						
						let minWalls = 1+Math.min(...toInclude)
						distanceWalls.set(x, y, minWalls)
					}
				}
			}
			for (let y = 49; y >= 0; y -= 1) {
				for (let x = 49; x >= 0; x -= 1) {
					let toInclude = [distanceWalls.get(x, y)]
					if (y+1 < 50) {
						toInclude.push(distanceWalls.get(x  , y+1)+1)
						if (x+1 < 50) {
							toInclude.push(distanceWalls.get(x+1, y+1)+1)
						}
						if (x-1 >= 0) {
							toInclude.push(distanceWalls.get(x-1, y+1)+1)
						}
					}
					if (x+1 < 50) {
						toInclude.push(distanceWalls.get(x+1, y  )+1)
					}
					let minWalls = Math.min(...toInclude)
		
					distanceWalls.set(x, y, minWalls)
				}
			}

			persists['distanceWalls'] = distanceWalls.serialize()
			return distanceWalls
		}
		let getDistanceExits = function() {
			let distanceExits = new PathFinder.CostMatrix

			// This is a flood fill from room exits

			let toVisit = roomObj.find(FIND_EXIT)
			let hash = {}
		
			let depth = 0
			let done = false
			while (!done) {
				let next = []
		
				for (let idx in toVisit) {
					let roomPos = toVisit[idx]
		
					distanceExits.set(roomPos.x, roomPos.y, depth)
		
					let adjacent = roomPos.getAdjacent({serialize: false, checkTerrain: true})
					for (let adjIdx in adjacent) {
						let serPos = RoomPosition.serialize(adjacent[adjIdx])
						if (!_.has(hash, serPos)) {
							hash[serPos] = depth
							next.push(adjacent[adjIdx])
						}
					}
				}
		
				if (next.length == 0) {
					done = true
				}
				depth += 1
				toVisit = next
			}
			for (let x = 0; x < 50; x += 1) {
				for (let y = 0; y < 50; y += 1) {
					if (roomTerrain.get(x, y) == TERRAIN_MASK_WALL) {
						distanceExits.set(x, y, 0)
					}
					else if ([0, 1, 2].includes(distanceExits.get(x, y))) {
						distanceExits.set(x, y, 255)
					}
					else {
						distanceExits.set(x, y, distanceExits.get(x, y)-1)
					}
				}
			}

			persists['distanceExits'] = distanceExits.serialize()
			return distanceExits
		}
		let getDistanceWallsExits = function() {
			let distanceWallsExits = new PathFinder.CostMatrix
			let distanceWalls = PathFinder.CostMatrix.deserialize(persists['distanceWalls'])
			let distanceExits = PathFinder.CostMatrix.deserialize(persists['distanceExits'])

			// this is just the min of distanceWalls and distanceExits with some special conditions about invalid tiles
			for (let x = 0; x < 50; x += 1) {
				for (let y = 0; y < 50; y += 1) {
					if (roomTerrain.get(x, y) == TERRAIN_MASK_WALL) {
						distanceWallsExits.set(x, y, 1)
					}
					else {
						if (distanceWalls.get(x, y) == 255 || distanceExits.get(x, y) == 255) {
							distanceWallsExits.set(x, y, 255)
						}
						else {
							distanceWallsExits.set(x, y, 5*Math.min(
								distanceWalls.get(x, y),
								distanceExits.get(x, y)
							))
						}
					}
				}
			}

			persists['distanceWallsExits'] = distanceWallsExits.serialize()
			return distanceWallsExits
		}
		let generateWallLocations = function() {
			let distanceWallsExits = PathFinder.CostMatrix.deserialize(persists['distanceWallsExits'])

			// Predefining start & end locations based on valid exit side
			let startLocations = {
				1: 	new RoomPosition( 0,  0, roomObj.name),
				3:	new RoomPosition(49,  0, roomObj.name),
				5:	new RoomPosition(49, 49, roomObj.name),
				7:	new RoomPosition( 0, 49, roomObj.name)
			}
			let endLocations = {
				1:	new RoomPosition(49,  0, roomObj.name),
				3:	new RoomPosition(49, 49, roomObj.name),
				5:	new RoomPosition( 0, 49, roomObj.name),
				7:	new RoomPosition( 0,  0, roomObj.name)
			}
			let exits = Game.map.describeExits(roomObj.name)
			let wallSpots = []

			for (let exitID in exits) {
				let startLocation = startLocations[exitID]
				let endLocation = endLocations[exitID]
				let path = PathFinder.primitivePathfind(startLocation, endLocation, distanceWallsExits)
				let spots = _.filter(path, s => roomTerrain.get(s.x, s.y) != TERRAIN_MASK_WALL)
				wallSpots.push(...spots)
			}

			persists['wallSpots'] = wallSpots
			outObj['wallSpots'] = wallSpots
			return wallSpots
		}
		let getInterior = function() {
			let interiorMap = new PathFinder.CostMatrix

			// This flood fill is done in two steps
			// Step 1: Flood fill from exits until we reach walls
			// Step 2: Flood fill from walls until they're no spots left

			let serializedWalls = _.map(persists['wallSpots'], s => RoomPosition.serialize(s))
			let serializedExits = _.map(roomObj.find(FIND_EXIT), s => RoomPosition.serialize(s))

			let exitFoundWalls = []
			let wallFoundWalls = []

			// Seed the flood fills
			let exitToVisit = serializedExits
			let exitHash = {}

			// Initialize hashes
			for (let position of exitToVisit) {
				exitHash[position] = {
					from:			null
				}
			}

			// Start the exit floodfill
			let exitDone = false
			while (!exitDone) {
				let next = []				
				for (let visiting of exitToVisit) {
					let positionObject = RoomPosition.parse(visiting)

					interiorMap.set(positionObject.x, positionObject.y, 255)

					// getAdjacent just returns 8 tiles (but filtered to not include those blocked by terrain).
					let adjacentPositions = positionObject.getAdjacent({serialize: true, checkTerrain: true})
					for (let target of adjacentPositions) {

						// Is this on a wall?
						if (serializedWalls.includes(target)) {
							if (!exitFoundWalls.includes(target)) {
								exitFoundWalls.push(target)
							}
							continue
						}

						// Have we already looked at this?
						if (_.has(exitHash, target)) {
							continue
						}

						exitHash[target] = {
							from: visiting
						}

						next.push(target)
					}
				}

				// Are all valid positions already calculated?
				if (next.length == 0) {
					exitDone = true
				}
				// We compute all of the positions in `exitToVisit` before moving on to the next depth
				exitToVisit = next
			}

			// Set walls to be walls we found from this flood fill (filters out interior walls)
			let exitFoundWallObjs = _.map(exitFoundWalls, s => RoomPosition.parse(s))
			persists['wallSpots'] = exitFoundWallObjs
			outObj['wallSpots'] = exitFoundWallObjs
			serializedWalls = exitFoundWalls

			let wallToVisit = serializedWalls
			let wallHash = {}

			// Initialize wallHash
			for (let position of wallToVisit) {
				wallHash[position] = {
					score: 	0,
					from:	null
				}
			}
			// Start the wall floodfill
			let wallDone = false
			while (!wallDone) {
				let next = []
				
				for (let visiting of wallToVisit) {
					let positionObject = RoomPosition.parse(visiting)

					interiorMap.set(positionObject.x, positionObject.y, wallHash[visiting].score)
					
					// getAdjacent just returns 8 tiles (but filtered to not include those blocked by terrain).
					let adjacentPositions = positionObject.getAdjacent({serialize: true, checkTerrain: true})
					for (let target of adjacentPositions) {
						let [from, score] = [visiting, wallHash[visiting].score+1]

						// Is this in our exitHash?
						if (_.has(exitHash, target)) {
							continue
						}

						// Is this on a wall?
						if (serializedWalls.includes(target)) {
							if (!wallFoundWalls.includes(target)) {
								wallFoundWalls.push(target)
							}
							continue
						}

						if (_.has(wallHash, target)) {
							if (score < wallHash[target].score) {
								wallHash[target].score = score
								wallHash[target].from = visiting
							}
							else {
								continue
							}
						}

						// Initialize object to live in wallHash
						wallHash[target] = {
							from:			from,
							score:			score
						}

						next.push(target)
					}
				}

				// Are all valid positions already calculated?
				if (next.length == 0) {
					wallDone = true
				}
				// We compute all of the positions in `toVisit` before moving on to the next depth
				wallToVisit = next
			}

			// Set walls to foundWalls (filters out exterior walls that don't touch interior)
			let wallFoundWallObj = _.map(wallFoundWalls, s => RoomPosition.parse(s))
			persists['wallSpots'] = wallFoundWallObj
			outObj['wallSpots'] = wallFoundWallObj
			serializedWalls = wallFoundWalls

			// One final pass to set wall positions to 255
			for (let i = 0; i < 50; i++) {
				for (let j = 0; j < 50; j++) {
					if (roomTerrain.get(i, j) == TERRAIN_MASK_WALL) {
						interiorMap.set(i, j, 255)
					}
				}
			}

			// Interior map is the visualized cost matrix
			persists['interior'] = interiorMap
			outObj['interior'] = interiorMap.serialize()
			return interiorMap
		}

		yield getDistanceWalls()
		yield getDistanceExits()
		yield getDistanceWallsExits()
		yield generateWallLocations()
		yield getInterior()
		return outObj
	}
}
global.Sector = Sector