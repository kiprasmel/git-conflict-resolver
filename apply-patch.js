#!/usr/bin/env node

const fs = require("fs")

const DIFF_HEADER_PREFIX_RM = "---"
const DIFF_HEADER_PREFIX_ADD = "+++"
const HUNK_HEADER = "@@"
const PREFIX_RM = "-"
const PREFIX_ADD = "+"
const PREFIX_CONTEXT = " "
const OP_TYPE_REMOVE = "remove"
const OP_TYPE_ADD = "add"
const EXPECTED_ARG_COUNT = 2

const HELP_TEXT = "Usage: apply-patch.js <target_file> <diff_file>"

function applyPatch(argv = process.argv.slice(2)) {
	const { targetFile, diffFile } = parseArgs(argv)

	const targetContent = fs.readFileSync(targetFile, "utf-8")
	const targetLines = targetContent.split("\n").map((line, idx, arr) => {
		return idx < arr.length - 1 || line !== "" ? line + "\n" : line
	})

	const diffContent = fs.readFileSync(diffFile, "utf-8")

	const operations = parseUnifiedDiff(diffContent)

	const resultLines = applyOperations(targetLines, operations)

	fs.writeFileSync(targetFile, resultLines.join(""))
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
		targetFile: argv[0],
		diffFile: argv[1]
	}
}

function parseUnifiedDiff(diffContent) {
	const lines = diffContent.trim().split("\n")
	const operations = []

	for (const line of lines) {
		if (line.startsWith(DIFF_HEADER_PREFIX_RM) || line.startsWith(DIFF_HEADER_PREFIX_ADD) || line.startsWith(HUNK_HEADER)) {
			continue
		}
		if (line.startsWith(PREFIX_RM)) {
			operations.push([OP_TYPE_REMOVE, line.slice(1)])
		} else if (line.startsWith(PREFIX_ADD)) {
			operations.push([OP_TYPE_ADD, line.slice(1)])
		} else if (line.startsWith(PREFIX_CONTEXT)) {
			continue
		}
	}

	return operations
}

function applyOperations(targetLines, operations) {
	const result = []
	let i = 0

	while (i < targetLines.length) {
		const line = targetLines[i]
		let removed = false

		for (const [opType, opLine] of operations) {
			if (opType === OP_TYPE_REMOVE && line.trimEnd() === opLine.trimEnd()) {
				removed = true
				break
			}
		}

		if (!removed) {
			result.push(line)
		}

		i++
	}

	const additions = operations
		.filter(([opType]) => opType === OP_TYPE_ADD)
		.map(([, opLine]) => opLine + "\n")

	if (additions.length > 0) {
		return [...additions, ...result]
	}

	return result
}

module.exports = { applyPatch, parseUnifiedDiff, applyOperations }

if (!module.parent) {
	applyPatch()
}
