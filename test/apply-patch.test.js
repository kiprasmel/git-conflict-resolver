const fs = require("fs")
const path = require("path")
const os = require("os")
const crypto = require("crypto")

const { applyPatch } = require("../apply-patch.js")

function createTempFile(content = "") {
	const randomHex = crypto.randomBytes(8).toString("hex")
	const tempFile = path.join(os.tmpdir(), `test-${randomHex}.txt`)
	fs.writeFileSync(tempFile, content)
	return tempFile
}

function createTempDiff(content) {
	const randomHex = crypto.randomBytes(8).toString("hex")
	const tempFile = path.join(os.tmpdir(), `test-${randomHex}.diff`)
	fs.writeFileSync(tempFile, content)
	return tempFile
}

describe("apply-patch.js", () => {
	let tempFiles = []

	afterEach(() => {
		tempFiles.forEach(file => {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file)
			}
		})
		tempFiles = []
	})

	test("should remove a single line", () => {
		const targetFile = createTempFile(`\
line1
line2
line3
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,3 +1,2 @@
 line1
-line2
 line3
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line1\nline3\n")
	})

	test("should add a single line", () => {
		const targetFile = createTempFile(`\
line1
line3
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,2 +1,3 @@
 line1
+line2
 line3
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line2\nline1\nline3\n")
	})

	test("should remove multiple lines", () => {
		const targetFile = createTempFile(`\
line1
line2
line3
line4
line5
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,5 +1,3 @@
 line1
-line2
-line3
 line4
 line5
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line1\nline4\nline5\n")
	})

	test("should add multiple lines", () => {
		const targetFile = createTempFile(`\
line1
line5
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,2 +1,5 @@
 line1
+line2
+line3
+line4
 line5
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line2\nline3\nline4\nline1\nline5\n")
	})

	test("should handle mixed operations (remove + add)", () => {
		const targetFile = createTempFile(`\
line1
line2
line3
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,3 +1,3 @@
 line1
-line2
+line2-modified
 line3
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line2-modified\nline1\nline3\n")
	})

	test("should handle lines with trailing whitespace", () => {
		const targetFile = createTempFile(`\
line1  
line2
line3  
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,3 +1,2 @@
 line1  
-line2
 line3  
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line1  \nline3  \n")
	})

	test("should handle empty target file", () => {
		const targetFile = createTempFile("")
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -0,0 +1,2 @@
+line1
+line2
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line1\nline2\n")
	})

	test("should handle empty diff (no changes)", () => {
		const targetFile = createTempFile(`\
line1
line2
line3
`)
		const diffFile = createTempDiff(`\
--- old
+++ new
@@ -1,3 +1,3 @@
 line1
 line2
 line3
`)
		tempFiles.push(targetFile, diffFile)

		applyPatch([targetFile, diffFile])

		const result = fs.readFileSync(targetFile, "utf-8")
		expect(result).toBe("line1\nline2\nline3\n")
	})
})
