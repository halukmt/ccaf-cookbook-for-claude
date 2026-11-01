<!-- Loads when a session starts in this directory, or when a file here is read from elsewhere.
     Move this file into the package it describes. -->

# API Conventions

- REST paths are kebab-case.
- Every response has the shape { data, error, metadata }.
- Check each request body against a Zod schema where the handler receives it.
