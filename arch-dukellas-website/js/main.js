document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileNav();
  initPropertyModal();
  initContactForm();
  initGalleryLightbox();
  initScrollAnimations();
});

function initHeader() {
  const header = document.getElementById('header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 60);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('navLinks');
  toggle.addEventListener('click', () => {
    nav.classList.toggle('active');
    document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('active');
    document.body.style.overflow = '';
  }));
}

const propertyData = {
  archway: {
    title: 'Archway Heights Estate',
    price: '₦1.5M per plot',
    image: 'images/lands/land-development-1.jpg',
    location: 'EMAH Community, Ekiadolor, Edo State',
    description: 'Affordable residential plots in the fast-developing EMAH Community, Ekiadolor. Perfect for families and first-time buyers. Currently offering 5% discount on all plots. Survey plans available and allocation ready.',
    features: ['₦1.5M per plot', '5% discount available', 'EMAH Community, Ekiadolor', 'Survey plan included', 'Flexible payment plan', 'Free site inspection']
  },
  royal: {
    title: 'Dukellas Royal Estate — Phase 1',
    price: '₦3.5M per plot',
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
    location: 'Benin Smart City, Ureghin Community, Upper Airport Road, Benin City',
    description: 'Welcome to Dukellas Royal Estate Phase 1. A fully serviced gated community with electricity, security, street lights, solar installation, CCTV, and hospital access. Own property, build wealth — secure tomorrow\'s asset at today\'s value.',
    features: ['₦3.5M per plot', 'Electricity & Solar', '24/7 Security & CCTV', 'Street lighting', 'Hospital access', 'Benin Smart City location']
  },
  airport: {
    title: 'Upper Airport Road Plots',
    price: 'Contact for pricing',
    image: 'images/lands/land-road.jpg',
    location: 'Upper Airport Road, Benin City, Edo State',
    description: 'Prime development plots along Upper Airport Road with perimeter fencing and cleared access roads. Ideal for residential or commercial development in one of Benin City\'s fastest-growing corridors.',
    features: ['Perimeter fencing', 'Cleared access roads', 'Upper Airport Road', 'Residential & commercial', 'Site visits welcome', 'Verified documentation']
  }
};

function initPropertyModal() {
  const modal = document.getElementById('propertyModal');
  const body = document.getElementById('modalBody');
  const close = () => { modal.classList.remove('active'); document.body.style.overflow = ''; };

  document.querySelectorAll('.view-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = propertyData[btn.dataset.property];
      if (!d) return;
      body.innerHTML = `
        <img src="${d.image}" alt="${d.title}">
        <h3>${d.title}</h3>
        <div class="modal-price">${d.price}</div>
        <p><strong>📍 ${d.location}</strong></p>
        <p>${d.description}</p>
        <ul class="modal-features">${d.features.map(f => `<li>${f}</li>`).join('')}</ul>
        <a href="#contact" class="btn btn-green btn-full modal-inquire">Inquire About This Property</a>
      `;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      body.querySelector('.modal-inquire').addEventListener('click', close);
    });
  });

  document.getElementById('modalClose').addEventListener('click', close);
  modal.querySelector('.modal-overlay').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

function initContactForm() {
  document.getElementById('contactForm').addEventListener('submit', e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = 'Message Sent! ✓';
      btn.style.background = '#1565C0';
      e.target.reset();
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; btn.disabled = false; }, 3000);
    }, 1200);
  });
}

function initGalleryLightbox() {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const close = () => lb.classList.remove('active');

  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      img.src = item.dataset.src || item.querySelector('img').src;
      lb.classList.add('active');
    });
  });
  document.getElementById('lightboxClose').addEventListener('click', close);
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

function initScrollAnimations() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.property-card, .service-card, .feature-card, .gallery-item, .promo-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    obs.observe(el);
  });
}
