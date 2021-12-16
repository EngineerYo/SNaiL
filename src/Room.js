Room.prototype.run = function() {
	if (!_.has(this.memory, 'setup') || this.memory.setup == false) {
		this.setup()
	}

	this.loadSpawnQueue()
	this.loadTasks()

	this.checkLevelUp()
	this.runSpawns()
	this.runTasks()

	this.saveSpawnQueue()
	this.saveTasks()
}

//#region Spawning code

// Create object hash with keys as creep names, separate from sortable list for actual queue (sorting purposes?)
Room.prototype.saveSpawnQueue = function() {
	this.memory.spawnQueue = this.spawnQueue
}
Room.prototype.loadSpawnQueue = function() {
	this.spawnQueue = this.memory.spawnQueue
}
Room.prototype.spawnCreep = function(creepName, creepBody, memObject) {
	if (_.has(this.spawnQueue, creepName)) {
		return false
	}

	let creepObj = {
		'body': creepBody,
		'memory': memObject
	}

	this.spawnQueue[creepName] = creepObj

	return true
}
Room.prototype.runSpawns = function() {
	if (this.spawnQueue.length == 0) {
		return
	}

	let availableSpawns = _.filter(this.find(FIND_MY_STRUCTURES), s => s.structureType == STRUCTURE_SPAWN && !s.spawning)
	let spawnQueueKeys = Object.keys(this.spawnQueue)

	for (let spawnIdx in availableSpawns) {
		let spawner = availableSpawns[spawnIdx]

		if (spawnQueueKeys.length <= spawnIdx) {
			return
		}

		let targetCreep = this.spawnQueue[spawnQueueKeys[spawnIdx]]
		let spawnCheck = spawner.createCreep(targetCreep.body, spawnQueueKeys[spawnIdx], targetCreep.memory)
		let illegalErrors = [-1, -3, -10, -14]

		if (typeof spawnCheck == 'string') {
			delete this.spawnQueue[spawnQueueKeys[spawnIdx]]
		}
		else if (illegalErrors.includes(spawnCheck)) {
			delete this.spawnQueue[spawnQueueKeys[spawnIdx]]
		}
	}
}
//#endregion

//#region Setup
Room.prototype.setup = function() {
	this.validateMemory()
	this.setupGatherTasks()
}
Room.prototype.validateMemory = function() {
    let objects = {
		spawnQueue: {}, 
		tasks: {}, 
		setup: true,
		buildQueue: [], 
		level: 1
	}
	for (let key in objects) {
		let val = objects[key]

		if (!_.has(this.memory, key)) {
			this.memory[key] = val
		}
	}
}
Room.prototype.setupGatherTasks = function() {
	let sources = this.find(FIND_SOURCES)

	for (let idx in sources) {
		let source = sources[idx]

		let spawnLocation = _.find(this.find(FIND_MY_STRUCTURES), s => s.structureType == STRUCTURE_SPAWN)
		let path = this.findPath(spawnLocation.pos, source.pos, {ignoreCreeps: true, ignoreRoads: true})

		let taskInfo = {
			'sourceID':		source.id,
			'sourcePos':	RoomPosition.serialize(source.pos),
			'sourceAmt':	source.energyCapacity,
			'path':			Room.serializePath(path),
			'pathLength':	path.length,
			'originPos':	RoomPosition.serialize(spawnLocation.pos)
		}

		this.addTask(new Task.GATHERING({
			'room': 	this.name,
			'id':		Task.Task.makeID(),
			'taskInfo':	taskInfo
		}))
	}
}
Room.prototype.setupMiningTasks = function() {
	let sources = this.find(FIND_SOURCES)
	for (let idx in sources) {
		let source = sources[idx]

		let spawnLocation = _.find(this.find(FIND_MY_STRUCTURES), s => s.structureType == STRUCTURE_SPAWN)
		let path = this.findPath(spawnLocation.pos, source.pos, {ignoreCreeps: true, ignoreRoads: true, range: 1})

		let lastNode = _.last(path)
		let lastPos = new RoomPosition(lastNode.x, lastNode.y, source.pos.roomName)

		let taskInfo = {
			'sourceID':		source.id,
			'sourcePos':	RoomPosition.serialize(source.pos),
			'sourceAmt':	source.energyCapacity,
			'standPos':		RoomPosition.serialize(lastPos),
			'path':			Room.serializePath(path),
			'pathLength':	path.length,
			'originPos':	RoomPosition.serialize(spawnLocation.pos)
		}
		
		this.addTask(new Task.MINING({
			'room': 	this.name,
			'id':		Task.Task.makeID(),
			'taskInfo':	taskInfo
		}))
	}
}
//#endregion

//#region Tasks
Room.prototype.saveTasks = function() {
	for (let taskID in this.tasks) {
		let taskObj = this.tasks[taskID]
		this.memory.tasks[taskID] = taskObj
	}
}
Room.prototype.loadTasks = function() {
	this.tasks = {}
	for (let taskID in this.memory.tasks) {
		let taskMem = this.memory.tasks[taskID]
		this.tasks[taskID] = new Task[taskMem.type](taskMem)
	}
}
Room.prototype.addTask = function(taskObj) {
	// Add a check if a task with this id already exists
	this.memory.tasks[taskObj.id] = taskObj
}
Room.prototype.runTasks = function() {
	for (let taskID in this.tasks) {
		let taskObj = this.tasks[taskID]

		// Check to see if we've been initialized
		if (!taskObj.taskInfo.init) {
			taskObj.init()
			taskObj.taskInfo['init'] = true
		}

		taskObj.run()
	}
}
//#endregion

// Level related things
Room.prototype.checkLevelUp = function() {
	// Check for flag changes instead maybe?	
	if (this.memory.level != this.controller.level) {
		console.log(`${this.name} levelled up!`)
		this.memory.level = this.controller.level

		this[`eventRCL${this.controller.level}`]()
		
		for (let taskName in this.tasks) {
			this.tasks[taskName].update()
		}
	}
}

Room.prototype.eventRCL2 = function() {
	console.log(`${this.name} - welcome to RCL 2!`)

	this.setupMiningTasks()
}