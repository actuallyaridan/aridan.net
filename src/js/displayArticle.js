// displayArticle.js

// ———— 1. Front Matter Parser ————
function parseFrontMatter(frontMatter) {
    const metadata   = { categories: [] };
    const lines      = frontMatter.split('\n');
    let   currentKey = null;
    let   currentVal = [];
  
    for (const line of lines) {
      if (line.includes(':')) {
        // flush previous multi‐line value
        if (currentKey && currentVal.length) {
          metadata[currentKey] = currentVal.join('\n').trim();
          currentVal = [];
        }
        const [key, ...rest] = line.split(':');
        currentKey = key.trim();
        let value = rest.join(':').trim();
        // strip quotes
        value = value.replace(/^['"](.*)['"]$/, '$1');
        metadata[currentKey] = value;
      }
      else if (currentKey && line.trim().startsWith('-')) {
        // array item
        metadata[currentKey] = metadata[currentKey] || [];
        metadata[currentKey].push(line.replace(/^\s*-\s*/, '').trim());
      }
      else if (currentKey) {
        // continuation of multi‐line
        currentVal.push(line);
      }
    }
  
    // flush last
    if (currentKey && currentVal.length) {
      metadata[currentKey] = currentVal.join('\n').trim();
    }
  
    // ensure categories is always an array of objects
    if (Array.isArray(metadata.categories)) {
      metadata.categories = metadata.categories.map(catLine => {
        // expect: name: "Foo" color: "bar"
        const m = catLine.match(/name:\s*"(.*?)"\s+color:\s*"(.*?)"/);
        if (m) return { name: m[1], color: m[2] };
        return { name: catLine, color: 'default' };
      });
    } else {
      metadata.categories = [];
    }
  
    return metadata;
  }
  
  // ———— 2. Markdown Parser ————
  function parseMarkdown(markdown) {
    // normalize newlines
    markdown = markdown.replace(/\r\n/g, '\n').trim();
  
    // front matter regex
    const fm = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/;
    const m  = markdown.match(fm);
    if (!m) {
      return {
        metadata: {
          title:      'Untitled Article',
          date:       new Date().toLocaleDateString(),
          categories: []
        },
        content: markdown
      };
    }
  
    const frontMatter = m[1];
    const content     = m[2].trim();
    const metadata    = parseFrontMatter(frontMatter);
  
    return { metadata, content };
  }
  
  // (Optional) expose for debugging in console
  // window.parseMarkdown = parseMarkdown;
  
  
  // ———— 3. Fetch, Render & Highlight ————
  async function fetchFullArticle() {
    const loadingSpinner   = document.getElementById('loading');
    const articleContainer = document.querySelector('main.container');
  
    try {
      // show spinner
      loadingSpinner.style.display = 'block';
  
      // get ?article=foo
      const params      = new URLSearchParams(window.location.search);
      const articleName = params.get('article');
      if (!articleName) throw new Error('No article specified in URL.');
  
      // fetch markdown
      const res = await fetch(`/assets/content/articles/${articleName}.md`);
      if (!res.ok) throw new Error('Article not found.');
  
      const md = await res.text();
      const { metadata, content } = parseMarkdown(md);
  
      // build HTML
      const articleHTML = `
        <article class="full-article">
          <div class="info">
            <p class="icon"><i class="fa-solid fa-newspaper icon-background"></i></p>
            <div>
              <h1 class="name">${metadata.title}</h1>
              <p class="description titleColor">${metadata.date}</p>
              <a href="/articles/" title="Back to articles" class="button backButton">
                <i class="fa-solid fa-arrow-left"></i>
              </a>
            </div>
          </div>
          <hr>
          <div class="article-content">
            ${marked.parse(content)}
          </div>
        </article>
      `;
  
      // inject and highlight
      articleContainer.innerHTML = articleHTML;
      Prism.highlightAll();
  
    } catch (error) {
      console.error('Error loading article:', error);
      articleContainer.innerHTML = `
        <div class="info">
          <p class="icon"><i class="fa-solid fa-xmark icon-background"></i></p>
          <div>
            <h1 class="name">Can't display article</h1>
            <p class="description titleColor">${error.message}</p>
            <a href="/articles/" class="button">Back to Articles</a>
          </div>
        </div>
      `;
    } finally {
      loadingSpinner.style.display = 'none';
    }
  }
  
  // ———— 4. Initialize on DOM Ready ————
  document.addEventListener('DOMContentLoaded', fetchFullArticle);
  