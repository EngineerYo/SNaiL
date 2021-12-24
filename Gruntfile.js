// Author: Screeps user tedivm. thank you!!
module.exports = function(grunt) {

	var config = require('./.screeps.json')
	var branch = grunt.option('branch') || config.branch
	var email = grunt.option('email') || config.email
	var password = grunt.option('password') || config.password
	var private_directory = grunt.option('private_directory') || config.private_directory

	grunt.loadNpmTasks('grunt-screeps')
	grunt.loadNpmTasks('grunt-contrib-clean')
	grunt.loadNpmTasks('grunt-contrib-copy')

	grunt.initConfig({
		// ty artem for grunt-screeps
		screeps: {
			options: {
				email: email,
				password: password,
				branch: branch
			},
			dist: {
				src: ['dist/*.js'],
			}
		},

		// Remove all files from ..
		clean: {
			// force must be on so it can clear files out of directories that aren't this one (for the private server)
			options: {
				force: true
			},
			// .. dist
			screeps: ['dist/*'],
			
			// .. from the private serer
			private: [`${private_directory}/${branch}/*`]
		},

		// Copy a flattened src	 to dist
		copy: {
			// Pushes the game code to the dist folder so it can be modified before being send to the screeps server.
			screeps: {
				files: [{
					expand: true,
					cwd: 'src/',
					src: '**',
					dest: 'dist/',
					filter: 'isFile',
					flatten: true
				}]
			},
			// Copies flattened game code to my private server directory
			private: {
				files: [{
					expand: true,
					cwd: 'src/',
					src: '**',
					dest: `${private_directory}/${branch}/`,
					filter: 'isFile',
					flatten: true
				}]
			}
		}

	})

	grunt.registerTask('default',	['clean:screeps', 'copy:screeps', 'screeps']);
	grunt.registerTask('private',	['clean:private', 'copy:private']);
	
	// to run, `grunt` in the command line (when the CLI is pointing to this directory) pushes game code to the `config.branch` branch in Screeps.
	// `grunt private` in the command line pushes game code to private server directory, also to the `config.branch` branch.
}
