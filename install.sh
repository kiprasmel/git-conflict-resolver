#!/usr/bin/env bash

set -xeuo pipefail

PREFIX="${PREFIX:-$HOME/.local}"
EXE="resolve-conflict.js"
EXE_OUT="git-conflict-resolver"

ln -s "$PWD/$EXE" "$PREFIX/bin/$EXE_OUT"
