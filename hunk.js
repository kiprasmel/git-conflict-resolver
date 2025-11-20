#!/usr/bin/env node

const os = require("os")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { execSync } = require("child_process")

const { applyPatch } = require("./apply-patch.js")

const CONFIG_DIR = path.join(os.homedir(), ".config", "git-conflict-resolver")
const UNDO_STATE_FILE = path.join(CONFIG_DIR, "last-hunk.json")
const TEMP_FILE_PREFIX = "git-conflict-resolver"
const DIFF_EXIT_CODE_FILES_DIFFER = 1

const CONFLICT_START = "<<<<<<<" 
const CONFLICT_MIDDLE_OLD = "|||||||"
const CONFLICT_SEPARATOR = "======="
const CONFLICT_END = ">>>>>>>"

const HUNK_HELP_TEXT = `\
usage: hunk <FILE> [-a|--apply] [--undo] [-h|--help]

Find and resolve first 3-way diff conflict in FILE

Flags:
    -a, --apply    apply the resolution to the file
    --undo         undo the last hunk operation
    -h, --help     show help and exit


Examples:
    hunk conflicted-file.txt
    hunk conflicted-file.txt -a
    hunk conflicted-file.txt --undo
`

function parseHunkArgs(argv) {
	const flags = {
		apply: false,
		undo: false,
		help: false,
	}
	
	const args = []
	for (const arg of argv) {
		if (arg === "-a" || arg === "--apply") {
			flags.apply = true
		} else if (arg === "--undo") {
			flags.undo = true
		} else if (arg === "-h" || arg === "--help") {
			flags.help = true
		} else {
			args.push(arg)
		}
	}
	
	return { flags, args }
}

function handleHunkCommand(argv) {
	const { flags, args } = parseHunkArgs(argv)

	if (flags.help) {
		console.log(HUNK_HELP_TEXT)
		process.exit(0)
	}
	
	if (flags.undo) {
		performUndo()
		return
	}
	
	if (args.length !== 1) {
		console.error("Error: hunk command requires exactly one filename")
		console.log(HUNK_HELP_TEXT)
		process.exit(1)
	}
	
	const filename = args[0]
	
	if (!fs.existsSync(filename)) {
		console.error(`Error: File not found: ${filename}`)
		process.exit(1)
	}
	
	const fileContent = fs.readFileSync(filename, "utf-8")
	
	const conflictInfo = findFirstConflictHunk(fileContent)
	
	if (!conflictInfo) {
		console.error("Error: No conflict markers found in file")
		process.exit(1)
	}
	
	const sections = parseConflictMarkers(conflictInfo.hunkText)
	
	if (!sections) {
		console.error("Error: Invalid conflict marker format")
		process.exit(1)
	}
	
	// Check if it's 2-way format (no OLD section)
	if (!sections.old) {
		console.error("Error: 2-way conflict format detected. Please use diff3 format.")
		console.error("Run: git config --global merge.conflictstyle diff3")
		process.exit(1)
	}
	
	const resolvedContent = resolveHunk(sections)
	
	if (!flags.apply) {
		// Just print the resolved content
		process.stdout.write(resolvedContent)
	} else {
		// Apply the resolution to the file
		applyResolvedHunk(filename, conflictInfo, resolvedContent)
		console.log(`Resolved first conflict in ${filename}`)
	}
}

function findFirstConflictHunk(fileContent) {
	const lines = fileContent.split("\n")
	let startIdx = -1
	let endIdx = -1
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		
		if (line.startsWith(CONFLICT_START)) {
			startIdx = i
		}
		
		if (startIdx !== -1 && line.startsWith(CONFLICT_END)) {
			endIdx = i
			break
		}
	}
	
	if (startIdx === -1 || endIdx === -1) {
		return null
	}
	
	const hunkLines = lines.slice(startIdx, endIdx + 1)
	const hunkText = hunkLines.join("\n") + "\n"
	
	return {
		startLine: startIdx,
		endLine: endIdx,
		hunkText: hunkText
	}
}

function parseConflictMarkers(hunkText) {
	const lines = hunkText.split("\n")
	
	let newOldStart = -1
	let oldStart = -1
	let newStart = -1
	let endIdx = -1
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		
		if (line.startsWith(CONFLICT_START)) {
			newOldStart = i
		} else if (line.startsWith(CONFLICT_MIDDLE_OLD)) {
			oldStart = i
		} else if (line.startsWith(CONFLICT_SEPARATOR)) {
			newStart = i
		} else if (line.startsWith(CONFLICT_END)) {
			endIdx = i
			break
		}
	}
	
	// Check if we have a valid conflict
	if (newOldStart === -1 || newStart === -1 || endIdx === -1) {
		return null
	}
	
	// If oldStart is -1, it's a 2-way conflict (no ||||||| marker)
	if (oldStart === -1) {
		return {
			newOld: lines.slice(newOldStart + 1, newStart).join("\n") + "\n",
			old: null,
			new: lines.slice(newStart + 1, endIdx).join("\n") + "\n"
		}
	}
	
	// 3-way conflict
	return {
		newOld: lines.slice(newOldStart + 1, oldStart).join("\n") + "\n",
		old: lines.slice(oldStart + 1, newStart).join("\n") + "\n",
		new: lines.slice(newStart + 1, endIdx).join("\n") + "\n"
	}
}

function resolveHunk(sections) {
	// Create temp files for OLD, NEW_OLD, NEW
	const tempOld = createTempFile("old")
	const tempNewOld = createTempFile("new_old")
	const tempNew = createTempFile("new")
	
	try {
		fs.writeFileSync(tempOld, sections.old)
		fs.writeFileSync(tempNewOld, sections.newOld)
		fs.writeFileSync(tempNew, sections.new)
		
		// Use existing resolveConflict logic
		const tempDiffFile = createTempDiffFile()
		
		try {
			const diffOutput = generateDiff(tempOld, tempNewOld)
			
			if (!diffOutput || diffOutput.trim() === "") {
				// No difference between OLD and NEW_OLD, just return NEW
				return sections.new
			}
			
			fs.writeFileSync(tempDiffFile, diffOutput)
			
			// Apply patch to temp NEW file
			applyPatch([tempNew, tempDiffFile])
			
			// Read the resolved content
			const resolvedContent = fs.readFileSync(tempNew, "utf-8")
			return resolvedContent
			
		} finally {
			if (fs.existsSync(tempDiffFile)) {
				fs.unlinkSync(tempDiffFile)
			}
		}
		
	} finally {
		// Clean up temp files
		if (fs.existsSync(tempOld)) fs.unlinkSync(tempOld)
		if (fs.existsSync(tempNewOld)) fs.unlinkSync(tempNewOld)
		if (fs.existsSync(tempNew)) fs.unlinkSync(tempNew)
	}
}

function createTempFile(suffix) {
	const randomHex = crypto.randomBytes(8).toString("hex")
	return path.join(os.tmpdir(), `${TEMP_FILE_PREFIX}.${suffix}.${randomHex}.txt`)
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

function applyResolvedHunk(filename, conflictInfo, resolvedContent) {
	const fileContent = fs.readFileSync(filename, "utf-8")
	const lines = fileContent.split("\n")
	
	// Replace the conflict hunk with resolved content
	const beforeConflict = lines.slice(0, conflictInfo.startLine)
	const afterConflict = lines.slice(conflictInfo.endLine + 1)
	
	// Remove trailing newline from resolvedContent if it exists to avoid double newlines
	const resolvedLines = resolvedContent.split("\n")
	if (resolvedLines[resolvedLines.length - 1] === "") {
		resolvedLines.pop()
	}
	
	const newLines = [...beforeConflict, ...resolvedLines, ...afterConflict]
	const newContent = newLines.join("\n")
	
	// Save undo state with resolved line count
	saveUndoState(filename, conflictInfo, resolvedLines.length)
	
	fs.writeFileSync(filename, newContent)
}

function saveUndoState(filename, conflictInfo, resolvedLineCount) {
	// Ensure config directory exists
	if (!fs.existsSync(CONFIG_DIR)) {
		fs.mkdirSync(CONFIG_DIR, { recursive: true })
	}
	
	const undoState = {
		filepath: path.resolve(filename),
		originalHunk: conflictInfo.hunkText,
		lineStart: conflictInfo.startLine,
		lineEnd: conflictInfo.endLine,
		resolvedLineCount: resolvedLineCount,
		timestamp: new Date().toISOString()
	}
	
	fs.writeFileSync(UNDO_STATE_FILE, JSON.stringify(undoState, null, 2))
}

function performUndo() {
	if (!fs.existsSync(UNDO_STATE_FILE)) {
		console.error("Error: No undo state found")
		console.error(`Expected undo state file at: ${UNDO_STATE_FILE}`)
		process.exit(1)
	}
	
	let undoState
	try {
		const content = fs.readFileSync(UNDO_STATE_FILE, "utf-8")
		undoState = JSON.parse(content)
	} catch (error) {
		console.error("Error: Failed to parse undo state file")
		process.exit(1)
	}
	
	const { filepath, originalHunk, lineStart, resolvedLineCount } = undoState
	
	if (!fs.existsSync(filepath)) {
		console.error(`Error: File not found: ${filepath}`)
		process.exit(1)
	}
	
	const fileContent = fs.readFileSync(filepath, "utf-8")
	const lines = fileContent.split("\n")
	
	// Restore the original conflict markers
	// Use resolvedLineCount to know where the resolved content ends
	const beforeConflict = lines.slice(0, lineStart)
	const afterConflict = lines.slice(lineStart + resolvedLineCount)
	
	const hunkLines = originalHunk.split("\n")
	if (hunkLines[hunkLines.length - 1] === "") {
		hunkLines.pop()
	}
	
	const newLines = [...beforeConflict, ...hunkLines, ...afterConflict]
	const newContent = newLines.join("\n")
	
	fs.writeFileSync(filepath, newContent)
	
	// Clear undo state
	fs.unlinkSync(UNDO_STATE_FILE)
	
	console.log(`Undone last hunk operation in ${filepath}`)
}

module.exports = {
	handleHunkCommand,
	parseHunkArgs,
	findFirstConflictHunk,
	parseConflictMarkers,
	resolveHunk,
	applyResolvedHunk,
	saveUndoState,
	performUndo,
	CONFIG_DIR,
	UNDO_STATE_FILE,
}
