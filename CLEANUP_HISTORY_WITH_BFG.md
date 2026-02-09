# Git History Cleanup with BFG (Optional Fast Alternative)

## Status
- ✅ Local cleanup: `git filter-branch` has already removed `node_modules/`, `tmp_chrome_profile/`, and `logs/` from local history.
- ✅ History force-pushed to GitHub (`main` branch updated).
- ✅ `tmp_chrome_profile/` moved to external backup: `C:\Users\86424\backups\tmp_chrome_profile_backup`
- ✅ `.gitignore` updated to prevent re-inclusion.

## Note on BFG (Faster Alternative)
**BFG Repo-Cleaner** is faster than `git filter-branch` for removing large files from history, especially with many commits. If you want to use it in the future (e.g., for a fresh clone or more aggressive cleanup):

### Installation & Usage (PowerShell)
```powershell
# 1. Install BFG via Chocolatey (if available) or download JAR
choco install bfg

# or manually:
# Download from https://rtyley.github.io/bfg-repo-cleaner/
# and place in your PATH or project folder

# 2. Clone a fresh mirror (or use existing repo):
& "C:\Program Files\Git\cmd\git.exe" clone --mirror https://github.com/cclazy123/streamers-autocheck.git streamers-autocheck.git

# 3. Run BFG to remove large files/folders:
bfg --delete-folders node_modules --delete-folders tmp_chrome_profile --delete-folders logs streamers-autocheck.git

# 4. Reflog expire and gc:
cd streamers-autocheck.git
& "C:\Program Files\Git\cmd\git.exe" reflog expire --expire=now --all
& "C:\Program Files\Git\cmd\git.exe" gc --prune=now --aggressive
cd ..

# 5. Force push back to origin:
& "C:\Program Files\Git\cmd\git.exe" -C streamers-autocheck.git push --force --mirror https://github.com/cclazy123/streamers-autocheck.git

# 6. (Optional) Delete the mirror clone:
Remove-Item -Recurse -Force streamers-autocheck.git
```

## Already Done (Current Approach)
- `git filter-branch` was used on the local repo.
- History was rewritten in `main` branch.
- Force push to origin completed (`bac5174` is the new HEAD).
- Sensitive data (`tmp_chrome_profile/`, `logs/`, `node_modules/`) removed from Git.

## Next Steps
1. **Fresh Clone** (if collaborators need it):
   ```powershell
   & "C:\Program Files\Git\cmd\git.exe" clone https://github.com/cclazy123/streamers-autocheck.git streamers-autocheck-clean
   cd streamers-autocheck-clean
   npm ci
   ```

2. **Deploy to Vercel** (if not done):
   - Import the repository from GitHub.
   - Set environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `LOG_LEVEL`).
   - Set output directory to `public`.
   - Deploy.

3. **Running Locally**:
   ```powershell
   # Set Puppeteer env vars
   $env:PUPPETEER_USER_DATA_DIR = "$PWD\tmp_chrome_profile"
   $env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
   
   # Run scheduler worker
   node src/scheduler-worker.js
   
   # Or run API server
   npm start
   ```

## Backup Location
`tmp_chrome_profile/` has been safely moved to: `C:\Users\86424\backups\tmp_chrome_profile_backup`
(You can delete this folder after confirming the app runs without it, or keep it for reference.)
