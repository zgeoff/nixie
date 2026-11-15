# The code image: the tools that one code run uses to run a short program, with no package
# installer. Build it from the repo root, as docs/runbooks/imp-isolation-tests.md describes. impd
# refuses a FROM that names its image with a variable, so each FROM writes out its version, and the
# Bun version equals .bun-version.

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS bun

FROM python:3.13.18-slim-bookworm@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72

# bash, coreutils, findutils, grep, sed, tar and util-linux (which holds setpriv) come with the base.
RUN apt-get update \
  && apt-get install --no-install-recommends --yes \
    bc=1.07.1-3+b1 \
    bzip2=1.0.8-5+b1 \
    file=1:5.44-3 \
    gawk=1:5.2.1-2 \
    git=1:2.39.5-0+deb12u3 \
    jq=1.6-2.1+deb12u3 \
    less=590-2.1~deb12u2 \
    patch=2.7.6-7 \
    ripgrep=13.0.0-4+b2 \
    sqlite3=3.40.1-2+deb12u2 \
    tree=2.1.0-1 \
    unzip=6.0-28+deb12u1 \
    xz-utils=5.4.1-1+deb12u2 \
    zip=3.0-13+deb12u1 \
    zstd=1.5.4+dfsg2-5 \
  && rm -rf /var/lib/apt/lists/*

# numpy, pandas, scipy, duckdb, matplotlib with Pillow, openpyxl, pdfplumber and python-docx, with
# every package they pull in. The image leaves out ffmpeg, polars and ImageMagick.
RUN pip install --no-cache-dir --only-binary=:all: \
    cffi==2.1.1 \
    charset-normalizer==3.5.2 \
    contourpy==1.4.0 \
    cryptography==50.0.2 \
    cycler==0.12.1 \
    duckdb==2.0.0 \
    et-xmlfile==2.0.0 \
    fonttools==4.68.0 \
    kiwisolver==1.5.1 \
    lxml==6.1.3 \
    matplotlib==3.11.2 \
    numpy==2.5.4 \
    openpyxl==3.1.5 \
    packaging==26.3 \
    pandas==3.1.1 \
    pdfminer-six==20260107 \
    pdfplumber==0.11.10 \
    pillow==13.0.0 \
    pycparser==3.12 \
    pyparsing==3.3.3 \
    pypdfium2==5.15.2 \
    python-dateutil==4.0.0 \
    python-docx==1.2.0 \
    scipy==1.18.1 \
    typing-extensions==4.16.0 \
    tzdata==2026.6

# Bun runs the javascript and typescript programs. The sandbox has no network, so nothing it
# installs could arrive.
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# The image holds no package installer: no pip, no ensurepip, and no apt. dpkg stays, because the
# package database needs it.
RUN python -m pip uninstall --yes pip setuptools wheel \
  && rm -rf /usr/local/lib/python3.13/ensurepip /usr/local/bin/pip /usr/local/bin/pip3 \
    /usr/local/bin/pip3.13 \
  && rm -rf /usr/bin/apt /usr/bin/apt-* /usr/lib/apt /var/lib/apt /var/cache/apt /etc/apt

# nixie runs the program as the user code, in /work, and copies each skill into /skills as root.
RUN useradd --create-home --home-dir /home/code --shell /bin/bash code \
  && mkdir -p /work /skills \
  && chown code:code /work \
  && chown root:root /skills \
  && chmod 755 /skills

ENV HOME=/home/code \
    MPLBACKEND=Agg \
    MPLCONFIGDIR=/tmp/matplotlib \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /work
