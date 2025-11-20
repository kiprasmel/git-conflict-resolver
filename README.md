# git-conflict-resolver

auto-resolve merge conflicts.

## idea

given this conflict:

```diff
<<<<<<< HEAD                                  --- NEW OLD ---
||||||| parent of <committish> (<message>)    --- OLD ---
    line-1
=======                                       --- NEW ---
    line-1
    line-2
	line-3
>>>>>>> <committish> (<message>)              --- END NEW ---
```

- we can easily tell, that someone else (from OLD to NEW OLD) has deleted `line-1`.
- we can then easily see, that in NEW, that `line-1` is still present, along with our other changes (additions of `line-2` and `line-3`)

in this scenario, the obvious fix is to:

- take the delta of OLD -> NEW OLD, and apply it to NEW
  - i.e., remove `line-1` from NEW
- pick NEW

that's it.

---

and there's likely more of such scenarios; this is just an easy example.

- opposite scenario (`line-1` was added in NEW_OLD => add `line-1` to NEW and pick NEW)

---

see also https://github.com/kiprasmel/git-diff3c
