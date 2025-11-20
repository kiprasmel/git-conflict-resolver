#!/usr/bin/env node

const os = require("os")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { execSync } = require("child_process")

const { applyPatch } = require("./apply-patch.js")

const EXPECTED_ARG_COUNT = 3
const TEMP_FILE_PREFIX = "git-conflict-resolver"
const DIFF_EXIT_CODE_FILES_DIFFER = 1

const HELP_TEXT = `\
usage:
resolve-conflict <OLD> <NEW_OLD> <NEW>

This will:
  1. Generate diff between old_file and new_old_file
  2. Apply that diff to new_file (ignoring context mismatches)

Example:
  resolve-conflict.js old new_old new
`

function resolveConflict(argv = process.argv.slice(2)) {
	const { oldFile, newOldFile, newFile } = parseArgs(argv)

	validateFiles([oldFile, newOldFile, newFile])

	const tempDiffFile = createTempDiffFile()

	try {
		const diffOutput = generateDiff(oldFile, newOldFile)

		if (!diffOutput || diffOutput.trim() === "") {
			return
		}

		fs.writeFileSync(tempDiffFile, diffOutput)

		applyPatch([newFile, tempDiffFile])

	} finally {
		if (fs.existsSync(tempDiffFile)) {
			fs.unlinkSync(tempDiffFile)
		}
	}
}

function parseArgs(argv) {
	if (argv.length !== EXPECTED_ARG_COUNT) {
		if (module.parent) {
			throw new Error(HELP_TEXT)
		}
		console.log(HELP_TEXT)
		process.exit(1)
	}

	return {
		oldFile: argv[0],
		newOldFile: argv[1],
		newFile: argv[2]
	}
}

function validateFiles(files) {
	for (const file of files) {
		if (!fs.existsSync(file)) {
			const errorMsg = `Error: File not found: ${file}`
			if (module.parent) {
				throw new Error(errorMsg)
			}
			console.error(errorMsg)
			process.exit(1)
		}
	}
}

function createTempDiffFile() {
	const randomHex = crypto.randomBytes(8).toString("hex")
	return path.join(os.tmpdir(), `${TEMP_FILE_PREFIX}.${randomHex}.diff`)
}

function generateDiff(oldFile, newOldFile) {
	let diffOutput
	try {
		diffOutput = execSync(`diff -u "${oldFile}" "${newOldFile}"`, {
			encoding: "utf-8"
		})
	} catch (error) {
		diffOutput = error.stdout || ""
		if (error.status !== DIFF_EXIT_CODE_FILES_DIFFER) {
			throw error
		}
	}
	return diffOutput
}

module.exports = {
	resolveConflict,
	parseArgs,
	validateFiles,
	createTempDiffFile,
	generateDiff,
}

if (!module.parent) {
	resolveConflict()
}
