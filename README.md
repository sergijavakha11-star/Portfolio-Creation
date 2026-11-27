# აქციების დამატება — პროტოტიპი (ტესტის ვერსია)

სტატიკური საიტი, build-ის გარეშე. Figma: `BoRODGuAGrGphXTVxBPM3d`, სექცია `13423:34749` (ეკრანები 1–4).

რას აკეთებს: სიიდან აქციის მონიშვნა → არჩეული ჩნდება Sticky Bar-ის ზოლში (Selected Items), „−“-ით ამოიღება;
„შენი აქციები“ ხაზის checkbox ყველა შენს აქციას მონიშნავს / მოხსნის; ხაზზე დაჭერით იხსნება Bottom Sheet,
სადაც ცალ-ცალკე ან „ყველას მონიშვნით“ ირჩევ → „არჩევა“; ძებნა ფილტრავს სიას; ღილაკი აჩვენებს toast-ს.

## Vercel-ზე გამოქვეყნება (≈2 წუთი)

1. github.com → **New repository** → სახელი, მაგ. `portfolio-creation-test` → **Create repository**.
2. ცარიელ repo-ში → **uploading an existing file** → ამ საქაღალდის **მთელი შიგთავსი** ჩააგდე
   (`index.html`, `app.css`, `app.js`, `assets` საქაღალდე, `.nojekyll`) → **Commit changes**.
   (Finder-ში `.nojekyll` დამალულია — `Cmd+Shift+.` აჩენს; Vercel-ისთვის აუცილებელი არ არის.)
3. vercel.com → **Add New → Project** → repo-ს გასწვრივ **Import** → Framework Preset: **Other** → **Deploy**.
4. ლინკი: `https://portfolio-creation-test.vercel.app` (ან Vercel-ის მიცემული სახელი).

## განახლება

პროტოტიპს ვასწორებთ `~/Desktop/portfolio-creation-prototype/prototypes/owned-stocks/`-ში, შემდეგ:

```
python3 ~/Desktop/portfolio-creation-prototype/build_web.py
```

და GitHub-ზე ახალ ფაილებს ატვირთავ (Add file → Upload files → Commit) — Vercel თვითონ გადააწყობს.

## შრიფტი

BOG შრიფტი მხოლოდ **შეკვეცილი** სახითაა ჩაშენებული `index.html`-ში (მხოლოდ ამ გვერდის ~120 სიმბოლო,
სახელების/მეტამონაცემების გარეშე). ცალკე შრიფტის ფაილი საიტზე არ იდება. ახალი ტექსტის დამატების შემდეგ
`build_web.py` თავიდან გაუშვი.
