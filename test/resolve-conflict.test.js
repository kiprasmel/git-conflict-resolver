const fs = require("fs")
const path = require("path")
const os = require("os")
const crypto = require("crypto")

const { resolveConflict } = require("../resolve-conflict.js")

function createTempFile(content = "") {
	const randomHex = crypto.randomBytes(8).toString("hex")
	const tempFile = path.join(os.tmpdir(), `test-${randomHex}.txt`)
	fs.writeFileSync(tempFile, content)
	return tempFile
}

describe("resolve-conflict.js", () => {
	let tempFiles = []

	afterEach(() => {
		tempFiles.forEach(file => {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file)
			}
		})
		tempFiles = []
	})

	test("should resolve conflict with line removed in new_old", () => {
		const oldFile = createTempFile(`\
line1
line2
line3
`)
		const newOldFile = createTempFile(`\
line1
line3
`)
		const newFile = createTempFile(`\
line1
line2
line3
line4
`)
		tempFiles.push(oldFile, newOldFile, newFile)

		resolveConflict([oldFile, newOldFile, newFile])

		const result = fs.readFileSync(newFile, "utf-8")
		expect(result).toBe("line1\nline3\nline4\n")
	})

	test("should resolve conflict with line added in new_old", () => {
		const oldFile = createTempFile(`\
line1
line3
`)
		const newOldFile = createTempFile(`\
line1
line2
line3
`)
		const newFile = createTempFile(`\
line1
line3
line4
`)
		tempFiles.push(oldFile, newOldFile, newFile)

		resolveConflict([oldFile, newOldFile, newFile])

		const result = fs.readFileSync(newFile, "utf-8")
		expect(result).toBe("line2\nline1\nline3\nline4\n")
	})

	test("should handle multiple changes", () => {
		const oldFile = createTempFile(`\
line1
line2
line3
line4
`)
		const newOldFile = createTempFile(`\
line1
line3-modified
line4
`)
		const newFile = createTempFile(`\
line1
line2
line3
line4
line5
`)
		tempFiles.push(oldFile, newOldFile, newFile)

		resolveConflict([oldFile, newOldFile, newFile])

		const result = fs.readFileSync(newFile, "utf-8")
		expect(result).toBe("line3-modified\nline1\nline4\nline5\n")
	})

	test("should handle no differences between old and new_old", () => {
		const oldFile = createTempFile(`\
line1
line2
line3
`)
		const newOldFile = createTempFile(`\
line1
line2
line3
`)
		const newFile = createTempFile(`\
line1
line2
line3
line4
`)
		tempFiles.push(oldFile, newOldFile, newFile)

		resolveConflict([oldFile, newOldFile, newFile])

		const result = fs.readFileSync(newFile, "utf-8")
		expect(result).toBe("line1\nline2\nline3\nline4\n")
	})

	test("should fail with file validation error for non-existent old file", () => {
		const nonExistentFile = path.join(os.tmpdir(), `non-existent-${crypto.randomBytes(8).toString("hex")}.txt`)
		const newOldFile = createTempFile(`\
line1
`)
		const newFile = createTempFile(`\
line2
`)
		tempFiles.push(newOldFile, newFile)

		expect(() => {
			resolveConflict([nonExistentFile, newOldFile, newFile])
		}).toThrow()
	})

	test("should cleanup temp diff file after execution", () => {
		const oldFile = createTempFile(`\
line1
line2
`)
		const newOldFile = createTempFile(`\
line1
`)
		const newFile = createTempFile(`\
line1
line2
line3
`)
		tempFiles.push(oldFile, newOldFile, newFile)

		const tmpDir = os.tmpdir()
		const beforeFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith("git-conflict-resolver"))

		resolveConflict([oldFile, newOldFile, newFile])

		const afterFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith("git-conflict-resolver"))

		expect(afterFiles.length).toBe(beforeFiles.length)
	})
})
