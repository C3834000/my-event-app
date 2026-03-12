# סקריפט להוספת מפתחות Supabase ל-Vercel

Write-Host "🔑 מוסיף מפתחות Supabase ל-Vercel..." -ForegroundColor Cyan

$projectName = "my-app"
$supabaseUrl = "https://nzlrmkzbarnawngansul.supabase.co"
$supabaseKey = "sb_publishable_KtWPHnK1ANgkju48tExMdA_az8RbJ6m"

Write-Host "`n📍 Project: $projectName" -ForegroundColor Yellow
Write-Host "🌐 Supabase URL: $supabaseUrl" -ForegroundColor Yellow

# הוספת VITE_SUPABASE_URL
Write-Host "`n⬆️ מוסיף VITE_SUPABASE_URL..." -ForegroundColor Green
vercel env add VITE_SUPABASE_URL production

# הוספת VITE_SUPABASE_ANON_KEY
Write-Host "`n⬆️ מוסיף VITE_SUPABASE_ANON_KEY..." -ForegroundColor Green
vercel env add VITE_SUPABASE_ANON_KEY production

Write-Host "`n✅ הסתיים! כעת יש לפרוס מחדש את הפרויקט." -ForegroundColor Green
Write-Host "`n🚀 מפרוס מחדש..." -ForegroundColor Cyan
vercel --prod

Write-Host "`n🎉 הושלם! Supabase פעיל!" -ForegroundColor Green
