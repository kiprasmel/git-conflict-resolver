const fs = require("fs")
const path = require("path")
const os = require("os")
const crypto = require("crypto")

const {
	findFirstConflictHunk,
	parseConflictMarkers,
	resolveHunk,
	applyResolvedHunk,
	saveUndoState,
	performUndo,
	CONFIG_DIR,
	UNDO_STATE_FILE,
} = require("../hunk.js")

function createTempFile(content = "") {
	const randomHex = crypto.randomBytes(8).toString("hex")
	const tempFile = path.join(os.tmpdir(), `test-hunk-${randomHex}.txt`)
	fs.writeFileSync(tempFile, content)
	return tempFile
}

describe("hunk.js", () => {
	let tempFiles = []

	afterEach(() => {
		// Clean up temp files
		tempFiles.forEach(file => {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file)
			}
		})
		tempFiles = []

		// Clean up undo state
		if (fs.existsSync(UNDO_STATE_FILE)) {
			fs.unlinkSync(UNDO_STATE_FILE)
		}
	})

	describe("findFirstConflictHunk", () => {
		test("should find first 3-way conflict hunk", () => {
			const content = `\
Some text before

<<<<<<< HEAD
||||||| parent of abc123
    line-1
=======
    line-1
    line-2
>>>>>>> abc123

Some text after
`
			const result = findFirstConflictHunk(content)

			expect(result).toEqual({
				startLine: 2,
				endLine: 8,
				hunkText: "<<<<<<< HEAD\n||||||| parent of abc123\n    line-1\n=======\n    line-1\n    line-2\n>>>>>>> abc123\n"
			})
		})

		test("should find first conflict when multiple conflicts exist", () => {
			const content = `\
First conflict:
<<<<<<< HEAD
||||||| parent
old1
=======
new1
>>>>>>> branch

Second conflict:
<<<<<<< HEAD
||||||| parent
old2
=======
new2
>>>>>>> branch
`
			const result = findFirstConflictHunk(content)

			expect(result).toEqual({
				startLine: 1,
				endLine: 6,
				hunkText: "<<<<<<< HEAD\n||||||| parent\nold1\n=======\nnew1\n>>>>>>> branch\n"
			})
		})

		test("should return null when no conflict markers found", () => {
			const content = "Just regular text\nwith no conflicts\n"
			const result = findFirstConflictHunk(content)

			expect(result).toBeNull()
		})

		test("should return null when conflict markers are incomplete", () => {
			const content = `\
<<<<<<< HEAD
Some text
but no ending marker
`
			const result = findFirstConflictHunk(content)

			expect(result).toBeNull()
		})
	})

	describe("parseConflictMarkers", () => {
		test("should parse 3-way conflict markers correctly", () => {
			const hunkText = `\
<<<<<<< HEAD
||||||| parent of abc123
    line-1
=======
    line-1
    line-2
    line-3
>>>>>>> abc123
`
			const result = parseConflictMarkers(hunkText)

			expect(result).not.toBeNull()
			expect(result.old).toBe("    line-1\n")
			expect(result.newOld).toBe("\n")
			expect(result.new).toBe("    line-1\n    line-2\n    line-3\n")
		})

		test("should detect 2-way conflict format (no old section)", () => {
			const hunkText = `\
<<<<<<< HEAD
    line-1
    line-2
=======
    line-3
    line-4
>>>>>>> abc123
`
			const result = parseConflictMarkers(hunkText)

			expect(result).not.toBeNull()
			expect(result.old).toBeNull()
			expect(result.newOld).toBe("    line-1\n    line-2\n")
			expect(result.new).toBe("    line-3\n    line-4\n")
		})

		test("should handle empty sections", () => {
			const hunkText = `\
<<<<<<< HEAD
||||||| parent
=======
    new-line
>>>>>>> branch
`
			const result = parseConflictMarkers(hunkText)

			expect(result).not.toBeNull()
			expect(result.old).toBe("\n")
			expect(result.newOld).toBe("\n")
			expect(result.new).toBe("    new-line\n")
		})

		test("should return null for invalid conflict format", () => {
			const hunkText = "Invalid conflict text"
			const result = parseConflictMarkers(hunkText)

			expect(result).toBeNull()
		})
	})

	describe("resolveHunk", () => {
		test("should resolve conflict with line removed in new_old", () => {
			const sections = {
				old: "    line-1\n    line-2\n    line-3\n",
				newOld: "    line-1\n    line-3\n",
				new: "    line-1\n    line-2\n    line-3\n    line-4\n"
			}

			const result = resolveHunk(sections)

			expect(result).toBe("    line-1\n    line-3\n    line-4\n")
		})

		test("should resolve conflict with line added in new_old", () => {
			const sections = {
				old: "    line-1\n    line-3\n",
				newOld: "    line-1\n    line-2\n    line-3\n",
				new: "    line-1\n    line-3\n    line-4\n"
			}

			const result = resolveHunk(sections)

			expect(result).toBe("    line-2\n    line-1\n    line-3\n    line-4\n")
		})

		test("should handle no difference between old and new_old", () => {
			const sections = {
				old: "    line-1\n",
				newOld: "    line-1\n",
				new: "    line-1\n    line-2\n"
			}

			const result = resolveHunk(sections)

			expect(result).toBe("    line-1\n    line-2\n")
		})

		test("should handle multiple changes", () => {
			const sections = {
				old: "    line-1\n    line-2\n    line-3\n",
				newOld: "    line-1-modified\n    line-3\n",
				new: "    line-1\n    line-2\n    line-3\n    line-4\n"
			}

			const result = resolveHunk(sections)

			expect(result).toBe("    line-1-modified\n    line-3\n    line-4\n")
		})
	})

	describe("applyResolvedHunk and saveUndoState", () => {
		test("should apply resolved hunk to file", () => {
			const fileContent = `\
Before conflict
<<<<<<< HEAD
||||||| parent
    old-line
=======
    old-line
    new-line
>>>>>>> branch
After conflict
`
			const tempFile = createTempFile(fileContent)
			tempFiles.push(tempFile)

			const conflictInfo = findFirstConflictHunk(fileContent)
			const resolvedContent = "    new-line\n"

			applyResolvedHunk(tempFile, conflictInfo, resolvedContent)

			const result = fs.readFileSync(tempFile, "utf-8")
			expect(result).toBe("Before conflict\n    new-line\nAfter conflict\n")
		})

		test("should save undo state when applying resolved hunk", () => {
			const fileContent = `\
<<<<<<< HEAD
||||||| parent
    old
=======
    new
>>>>>>> branch
`
			const tempFile = createTempFile(fileContent)
			tempFiles.push(tempFile)

			const conflictInfo = findFirstConflictHunk(fileContent)
			const resolvedContent = "    resolved\n"

			applyResolvedHunk(tempFile, conflictInfo, resolvedContent)

			expect(fs.existsSync(UNDO_STATE_FILE)).toBe(true)

			const undoState = JSON.parse(fs.readFileSync(UNDO_STATE_FILE, "utf-8"))
			expect(undoState.filepath).toBe(path.resolve(tempFile))
			expect(undoState.originalHunk).toBe("<<<<<<< HEAD\n||||||| parent\n    old\n=======\n    new\n>>>>>>> branch\n")
			expect(undoState.lineStart).toBe(0)
			expect(undoState.lineEnd).toBe(5)
		})

		test("should preserve content before and after conflict", () => {
			const fileContent = `\
Line 1
Line 2
<<<<<<< HEAD
||||||| parent
conflict-old
=======
conflict-new
>>>>>>> branch
Line 3
Line 4
`
			const tempFile = createTempFile(fileContent)
			tempFiles.push(tempFile)

			const conflictInfo = findFirstConflictHunk(fileContent)
			const resolvedContent = "conflict-resolved\n"

			applyResolvedHunk(tempFile, conflictInfo, resolvedContent)

			const result = fs.readFileSync(tempFile, "utf-8")
			expect(result).toBe("Line 1\nLine 2\nconflict-resolved\nLine 3\nLine 4\n")
		})
	})

	describe("performUndo", () => {
		test("should restore original conflict markers", () => {
			const originalContent = "<<<<<<< HEAD\n||||||| parent\n    old\n=======\n    new\n>>>>>>> branch\n"
			const tempFile = createTempFile(originalContent)
			tempFiles.push(tempFile)

			// First apply a resolution
			const conflictInfo = findFirstConflictHunk(originalContent)
			const resolvedContent = "    resolved\n"
			applyResolvedHunk(tempFile, conflictInfo, resolvedContent)

			// Now undo it
			performUndo()

			const result = fs.readFileSync(tempFile, "utf-8")
			expect(result).toBe("<<<<<<< HEAD\n||||||| parent\n    old\n=======\n    new\n>>>>>>> branch\n")
		})

		test("should clear undo state file after undo", () => {
			const originalContent = `\
<<<<<<< HEAD
||||||| parent
test
=======
test2
>>>>>>> branch
`
			const tempFile = createTempFile(originalContent)
			tempFiles.push(tempFile)

			const conflictInfo = findFirstConflictHunk(originalContent)
			applyResolvedHunk(tempFile, conflictInfo, "resolved\n")

			expect(fs.existsSync(UNDO_STATE_FILE)).toBe(true)

			performUndo()

			expect(fs.existsSync(UNDO_STATE_FILE)).toBe(false)
		})
	})

	describe("integration test", () => {
		test("should resolve complete conflict from README example", () => {
			const fileContent = `\
Some text before the conflict

<<<<<<< HEAD
||||||| parent of abc123 (some commit message)
    line-1
=======
    line-1
    line-2
    line-3
>>>>>>> abc123 (some commit message)

Some text after the conflict
`
			const tempFile = createTempFile(fileContent)
			tempFiles.push(tempFile)

			// Find and parse conflict
			const conflictInfo = findFirstConflictHunk(fileContent)
			expect(conflictInfo).toEqual({
				startLine: 2,
				endLine: 9,
				hunkText: "<<<<<<< HEAD\n||||||| parent of abc123 (some commit message)\n    line-1\n=======\n    line-1\n    line-2\n    line-3\n>>>>>>> abc123 (some commit message)\n"
			})

			const sections = parseConflictMarkers(conflictInfo.hunkText)
			expect(sections).toEqual({
				newOld: "\n",
				old: "    line-1\n",
				new: "    line-1\n    line-2\n    line-3\n"
			})

			// Resolve the conflict
			const resolvedContent = resolveHunk(sections)
			expect(resolvedContent).toBe("\n    line-2\n    line-3\n")

			// Apply to file
			applyResolvedHunk(tempFile, conflictInfo, resolvedContent)

			const result = fs.readFileSync(tempFile, "utf-8")
			expect(result).toBe("Some text before the conflict\n\n\n    line-2\n    line-3\n\nSome text after the conflict\n")

			// Test undo
			performUndo()
			const undoneContent = fs.readFileSync(tempFile, "utf-8")
			expect(undoneContent).toBe(fileContent)
		})
	})
})
