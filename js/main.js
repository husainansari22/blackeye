// Arch-Dukellas Global Properties - Main JavaScript

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileNav();
  initPropertyFilter();
  initPropertyModal();
  initTestimonialSlider();
  initContactForm();
  initScrollAnimations();
});

// Header scroll effect
function initHeader() {
  const header = document.getElementById('header');
  
  const handleScroll = () => {
    if (window.scrollY > 80) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

// Mobile navigation
function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  toggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

// Property filter
function initPropertyFilter() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const propertyCards = document.querySelectorAll('.property-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;

      propertyCards.forEach(card => {
        if (filter === 'all') {
          card.classList.remove('hidden');
        } else {
          const categories = card.dataset.category.split(' ');
          if (categories.includes(filter)) {
            card.classList.remove('hidden');
          } else {
            card.classList.add('hidden');
          }
        }
      });
    });
  });
}

// Property details modal
const propertyData = {
  gra: {
    title: 'GRA Phase 2 Residential Land',
    price: '₦8,500,000',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80',
    location: 'Government Reservation Area, Benin City',
    description: 'This premium residential plot is located in the most prestigious neighborhood in Benin City. The GRA Phase 2 estate features fully tarred roads, underground drainage systems, street lighting, and 24/7 security patrol. Perfect for building your dream luxury home.',
    features: ['600 sqm plot size', 'Certificate of Occupancy', 'Tarred roads & drainage', '24/7 estate security', 'Street lighting installed', 'Perimeter fencing complete']
  },
  airport: {
    title: 'Airport Road Commercial Land',
    price: '₦25,000,000',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    location: 'Airport Road, Benin City',
    description: 'Prime commercial land with direct road frontage on the busy Airport Road corridor. This location sees heavy daily traffic and is ideal for hotels, shopping malls, office complexes, or fuel stations. High appreciation potential.',
    features: ['1,200 sqm plot size', 'Deed of Assignment', 'Direct road frontage', 'High traffic location', 'Commercial zoning approved', 'Survey plan available']
  },
  sapele: {
    title: 'Sapele Road Garden Estate',
    price: '₦4,200,000',
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
    location: 'Sapele Road, Benin City',
    description: 'Our most popular estate for young families and first-time buyers. Sapele Road Garden Estate offers affordable plots with flexible payment plans starting from just ₦150,000 per month. The area is rapidly developing with schools and markets nearby.',
    features: ['450 sqm plot size', 'Registered survey plan', 'Payment plan available', 'From ₦150,000/month', 'Gated community', 'Allocation in 30 days']
  },
  ugbowo: {
    title: 'Ugbowo University Road Plot',
    price: '₦6,800,000',
    image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&q=80',
    location: 'Ugbowo, Benin City',
    description: 'Strategically located near the University of Benin and major teaching hospitals. This area has consistently high rental demand, making it excellent for both personal residence and investment purposes.',
    features: ['500 sqm plot size', 'C of O processing started', 'Near UNIBEN campus', 'High rental demand area', 'Good road network', 'Electricity available']
  },
  ekenwan: {
    title: 'Ekenwan Royal Gardens',
    price: '₦3,500,000',
    image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80',
    location: 'Ekenwan Road, Benin City',
    description: 'Our best-value estate offering quality land at an unbeatable price. Ekenwan Royal Gardens is a gated community with installment payment options from 6 months. Get allocated within 30 days of your first payment.',
    features: ['400 sqm plot size', 'Gazette & survey plan', '6-month payment plan', 'Gated community', '30-day allocation', 'Free site inspection']
  },
  ikpoba: {
    title: 'Ikpoba Hill View Estate',
    price: '₦12,000,000',
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80',
    location: 'Ikpoba Hill, Benin City',
    description: 'Premium elevated plots offering panoramic views of Benin City. This fully serviced estate features recreational green areas, street lights, perimeter fencing, and is one of our most exclusive developments. Only 3 plots remaining.',
    features: ['750 sqm plot size', 'Certificate of Occupancy', 'Panoramic city views', 'Recreational green areas', 'Only 3 plots left', 'Fully serviced estate']
  }
};

function initPropertyModal() {
  const modal = document.getElementById('propertyModal');
  const modalBody = document.getElementById('modalBody');
  const closeBtn = document.getElementById('modalClose');
  const overlay = modal.querySelector('.modal-overlay');

  document.querySelectorAll('.view-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.property;
      const data = propertyData[id];
      if (!data) return;

      modalBody.innerHTML = `
        <img src="${data.image}" alt="${data.title}">
        <h3>${data.title}</h3>
        <div class="modal-price">${data.price}</div>
        <p><strong>📍 ${data.location}</strong></p>
        <p>${data.description}</p>
        <ul class="modal-features">
          ${data.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <a href="#contact" class="btn btn-primary btn-full modal-inquire">Inquire About This Property</a>
      `;

      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      modalBody.querySelector('.modal-inquire').addEventListener('click', () => {
        closeModal();
      });
    });
  });

  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// Testimonial slider
function initTestimonialSlider() {
  const cards = document.querySelectorAll('.testimonial-card');
  const dots = document.querySelectorAll('.dot');
  let current = 0;
  let interval;

  function showSlide(index) {
    cards.forEach(c => c.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    cards[index].classList.add('active');
    dots[index].classList.add('active');
    current = index;
  }

  function nextSlide() {
    showSlide((current + 1) % cards.length);
  }

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      showSlide(parseInt(dot.dataset.index));
      resetInterval();
    });
  });

  function resetInterval() {
    clearInterval(interval);
    interval = setInterval(nextSlide, 6000);
  }

  interval = setInterval(nextSlide, 6000);
}

// Contact form
function initContactForm() {
  const form = document.getElementById('contactForm');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    setTimeout(() => {
      btn.textContent = 'Message Sent! ✓';
      btn.style.background = '#27ae60';
      form.reset();

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.disabled = false;
      }, 3000);
    }, 1500);
  });
}

// Scroll animations
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.property-card, .service-card, .why-item, .gallery-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}
