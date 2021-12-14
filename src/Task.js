class Task {
	run() {
		this.jobs.forEach(function(job, jobIdx) {
			job.forEach(function(creep, creepIdx) {
				creep.run(this.taskInfo)
			})
		})
	}

	static makeID() {
		return `${Math.random().toString(16).slice(2, 10)}`
	}

	serialize() {

	}
}

class GATHERING extends Task {
	/* GATHERING taskInfo expects
	{
		str sourceID,		Source ID
		str sourcePos,		Serialized source position
		int sourceAmt,		Source amount
		str path,			Serialized path
		int pathLength,		Path length,
		str originPos		Serialized origin position (storage, spawn, etc)
	}
	*/
	constructor(homeName, id, taskInfo, creeps={}) {
		super()

		this.room = homeName
		this.taskInfo = taskInfo
		this.creeps = creeps

		this.type = 'GATHERING'

		this.id = id
	}

	static gathererBody = [MOVE, MOVE, CARRY, CARRY, WORK]

	init() {
		this.initCreeps()
	}
	run() {
		this.runCreeps()
		this.spawnCreeps()
		this.runCreeps()
	}
	initCreeps() {
		let roomPos = RoomPosition.parse(this.taskInfo.sourcePos)

		// Find how many gatherers we can fit around the source
		let adjacentPositions = roomPos.getAdjacent().length
		
		for (i = 0; i < adjacentPositions; i += 1) {
			let creepName = `${this.id} ${Math.random().toString(16).slice(8)}`
			let creepBody = GATHERING.gathererBody

			this.creeps[creepName] = {
				'body':		creepBody,
				'status':	0
			}
		}
	}
	spawnCreeps() {
		for (let creepName in this.creeps) {
			let creepObj = this.creeps[creepName]

			if (!_.has(Game.creeps, creepName) && creepObj.status == 0) {
				let stateStack = [[
					'HARVEST', {
						'posStr':	this.taskInfo.sourcePos,
						'canPop':	false,
						'targetRoomName':	this.room
					}]
				]
				let memObject = {
					'taskID': 		this.id,
					'home':			this.room,
					'stack':		stateStack
				}

				let succeeded = Game.rooms[this.room].spawnCreep(creepName, creepObj.body, memObject)

				if (succeeded) {
					this.creeps[creepName].status = 1
				}
			}
		}
	}
	runCreeps() {
		for (let creepName in this.creeps) {
			if (!Game.creeps[creepName]) {
				continue
			}

			let creepObj = Game.creeps[creepName]
			if (creepObj.spawning) {
				this.creeps[creepName].status = 2
				continue
			}

			this.creeps[creepName].status = 0
			creepObj.run()
		}
	}
}

module.exports = {
	Task: Task,
	GATHERING:	GATHERING
}