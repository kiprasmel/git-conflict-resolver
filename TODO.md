# TODO

- [ ] -i flag - interactive resolving of <file>, or all files in repo
  - show file + hunk + would-be-resolved-result, ask for [Y/n/(u)ndo last] 

  
in this case:

```diff
<<<<<<< HEAD
	poetry run python main.py
||||||| parent of e5c1f6d6 (make api: kill previous instance before start)
	$(POETRY) run python main.py
=======
	$(POETRY) run python main.py --purpose=foo
>>>>>>> e5c1f6d6 (make api: kill previous instance before start)
```

should understand the change on a word-level (semantic / AST level?), instead of on a line-by-line level.

should resolve to

```diff
	poetry run python main.py --purpose=sintra-core
```

