const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const megaTriggers = document.querySelectorAll("[data-mega-trigger]");
let activeTrigger = null;
let megaCloseTimer;

function setMobileMenu(open) {
  if (!menuToggle || !mobileNav) return;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
  mobileNav.classList.toggle("is-open", open);
  document.body.classList.toggle("nav-open", open);

  if (!open) {
    mobileNav.querySelectorAll("[data-mobile-accordion]").forEach((button) => {
      setMobileAccordion(button, false, true);
    });
  }
}

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  setMobileMenu(!isOpen);
});

document.querySelectorAll(".mobile-nav a").forEach((link) => {
  link.addEventListener("click", () => setMobileMenu(false));
});

document.querySelectorAll(".brand").forEach((link) => {
  link.addEventListener("click", () => setMobileMenu(false));
});

function setMobileAccordion(button, open, instant = false) {
  const panel = button.nextElementSibling;
  if (!panel) return;

  cancelAnimationFrame(panel._accordionFrame || 0);
  panel.removeEventListener("transitionend", panel._accordionCleanup || (() => {}));

  const currentHeight = panel.getBoundingClientRect().height;
  panel.style.height = `${currentHeight}px`;
  panel.style.willChange = "height, opacity";

  const finish = (event) => {
    if (event.propertyName !== "height") return;
    panel.style.willChange = "";
    if (open) panel.style.height = "auto";
    panel.removeEventListener("transitionend", finish);
  };
  panel._accordionCleanup = finish;

  if (instant) {
    panel.style.transitionDuration = "1ms";
    button.setAttribute("aria-expanded", String(open));
    panel.style.height = open ? "auto" : "0px";
    panel.style.willChange = "";
    requestAnimationFrame(() => {
      panel.style.transitionDuration = "";
    });
    return;
  }

  panel._accordionFrame = requestAnimationFrame(() => {
    button.setAttribute("aria-expanded", String(open));
    panel.style.height = open ? `${panel.scrollHeight}px` : "0px";
    panel.addEventListener("transitionend", finish);
  });
}

document.querySelectorAll("[data-mobile-accordion]").forEach((button) => {
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    setMobileAccordion(button, !open);
  });
});

function setMega(trigger, open) {
  if (!trigger) return;
  const panelId = trigger.getAttribute("data-mega-trigger");
  const panel = document.getElementById(panelId);
  if (!panel) return;

  if (open) {
    if (activeTrigger && activeTrigger !== trigger) {
      setMega(activeTrigger, false);
    }
    activeTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    panel.classList.add("is-open");
  } else {
    trigger.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");
    if (activeTrigger === trigger) activeTrigger = null;
  }
}

function scheduleMegaClose(trigger) {
  clearTimeout(megaCloseTimer);
  megaCloseTimer = setTimeout(() => setMega(trigger, false), 120);
}

function keepMegaOpen(trigger) {
  clearTimeout(megaCloseTimer);
  setMega(trigger, true);
}

megaTriggers.forEach(trigger => {
  const panelId = trigger.getAttribute("data-mega-trigger");
  const panel = document.getElementById(panelId);
  if (!panel) return;

  trigger.addEventListener("mouseenter", () => keepMegaOpen(trigger));
  trigger.addEventListener("focus", () => keepMegaOpen(trigger));
  trigger.addEventListener("click", () => {
    const open = trigger.getAttribute("aria-expanded") === "true";
    setMega(trigger, !open);
  });
  trigger.addEventListener("mouseleave", () => scheduleMegaClose(trigger));
  panel.addEventListener("mouseenter", () => keepMegaOpen(trigger));
  panel.addEventListener("mouseleave", () => scheduleMegaClose(trigger));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const wasMenuOpen = menuToggle?.getAttribute('aria-expanded') === 'true';
    setMobileMenu(false);
    if (wasMenuOpen) menuToggle.focus();
    if (activeTrigger) setMega(activeTrigger, false);
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest("[data-mega-panel]") && !target.closest("[data-mega-trigger]")) {
    setMega(false);
  }
});

const revealTargets = document.querySelectorAll("[data-animate]");

function revealVisibleTargets() {
  revealTargets.forEach((target) => {
    const rect = target.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      target.classList.add("is-visible");
    }
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );

  revealTargets.forEach((target) => observer.observe(target));
  requestAnimationFrame(revealVisibleTargets);
  window.setTimeout(revealVisibleTargets, 120);
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href");
    if (!id || id === "#") {
      event.preventDefault();
      openModal('coming-soon-modal');
      return;
    }
    const target = document.querySelector(id);
    if (!target) {
      event.preventDefault();
      openModal('coming-soon-modal');
      return;
    }
    event.preventDefault();
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: "start" });
    if (link.classList.contains('skip-link')) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    history.pushState(null, "", id);
  });
});

document.addEventListener('click', (event) => {
  const target = event.target;
  const link = target.closest('a');
  if (link) {
    const href = link.getAttribute('href');
    if (!href || href === '') {
      event.preventDefault();
      openModal('coming-soon-modal');
      return;
    }
  }

  const btn = target.closest('button');
  if (btn) {
    const isInteractive = btn.hasAttribute('data-menu-toggle') || 
                          btn.hasAttribute('data-mobile-accordion') || 
                          btn.hasAttribute('data-mega-trigger') || 
                          btn.hasAttribute('data-carousel-prev') || 
                          btn.hasAttribute('data-carousel-next') || 
                          btn.hasAttribute('data-banner-prev') || 
                          btn.hasAttribute('data-banner-next') || 
                          btn.hasAttribute('data-modal-trigger') || 
                          btn.hasAttribute('data-modal-close') || 
                          btn.type === 'submit' || 
                          btn.id === 'chat-toggle' || 
                          btn.id === 'chat-close' ||
                          btn.id === 'lang-vi-btn' ||
                          btn.id === 'lang-en-btn' ||
                          btn.classList.contains('banner-dot') ||
                          btn.closest('.banner-dots') ||
                          btn.closest('.chat-notification');
    if (!isInteractive) {
      event.preventDefault();
      openModal('coming-soon-modal');
    }
  }
});

document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const track = carousel.querySelector("[data-carousel-track]");
  const prev = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  const dotsWrap = carousel.querySelector("[data-carousel-dots]");
  const slides = Array.from(track?.children || []);

  if (!track || slides.length === 0) return;

  let dots = [];

  function renderDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = "";
    dots = [];
    
    // We need to wait for layout to settle if slides are not yet sized
    if (slides[0].getBoundingClientRect().width === 0) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    if (maxScroll <= 0) return;

    const slideWidth = slides[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    const scrollStep = slideWidth + gap;
    
    const numDots = Math.ceil(maxScroll / scrollStep) + 1;

    for (let i = 0; i < numDots; i++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Đến trang ${i + 1}`);
      dot.addEventListener("click", () => {
        track.scrollTo({ left: i * scrollStep, behavior: "smooth" });
      });
      dotsWrap.appendChild(dot);
      dots.push(dot);
    }
  }

  function updateDots() {
    if (!dots.length) return;
    const maxScroll = track.scrollWidth - track.clientWidth;
    const slideWidth = slides[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    const scrollStep = slideWidth + gap;

    let activeIndex = 0;
    if (track.scrollLeft >= maxScroll - 5) {
      activeIndex = dots.length - 1;
    } else {
      activeIndex = Math.round(track.scrollLeft / scrollStep);
    }

    dots.forEach((dot, index) => dot.setAttribute("aria-current", String(index === activeIndex)));
  }

  function scrollBySlide(direction) {
    const slideWidth = slides[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    track.scrollBy({ left: direction * (slideWidth + gap), behavior: "smooth" });
  }

  renderDots();
  updateDots();

  prev?.addEventListener("click", () => scrollBySlide(-1));
  next?.addEventListener("click", () => scrollBySlide(1));
  track.addEventListener("scroll", () => window.requestAnimationFrame(updateDots), { passive: true });
  window.addEventListener("resize", () => {
    renderDots();
    updateDots();
  });
});

// Modal Handling
const modalTriggers = document.querySelectorAll('[data-modal-trigger]');
const modalCloseBtns = document.querySelectorAll('[data-modal-close]');
const modals = document.querySelectorAll('[data-modal]');

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modal) {
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

modalTriggers.forEach(trigger => {
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    const modalId = trigger.getAttribute('data-modal-trigger');
    openModal(modalId);
  });
});

modalCloseBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('[data-modal]');
    closeModal(modal);
  });
});

modals.forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    modals.forEach(modal => {
      if (modal.classList.contains('is-open')) {
        closeModal(modal);
      }
    });
  }
});

// Banner Carousel
const bannerCarousel = document.querySelector('[data-banner-carousel]');
if (bannerCarousel) {
  const track = bannerCarousel.querySelector('[data-banner-track]');
  const slides = bannerCarousel.querySelectorAll('.banner-slide');
  const prevBtn = bannerCarousel.querySelector('[data-banner-prev]');
  const nextBtn = bannerCarousel.querySelector('[data-banner-next]');
  const dots = bannerCarousel.querySelectorAll('.banner-dot');
  
  let currentSlide = 0;
  let autoPlayInterval;

  function goToSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    currentSlide = index;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentSlide);
    });
  }

  function nextSlide() {
    goToSlide(currentSlide + 1);
  }

  function prevSlide() {
    goToSlide(currentSlide - 1);
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlayInterval = setInterval(nextSlide, 3000);
  }

  function stopAutoPlay() {
    clearInterval(autoPlayInterval);
  }

  prevBtn?.addEventListener('click', () => {
    prevSlide();
    startAutoPlay();
  });

  nextBtn?.addEventListener('click', () => {
    nextSlide();
    startAutoPlay();
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      goToSlide(i);
      startAutoPlay();
    });
  });

  bannerCarousel.addEventListener('mouseenter', stopAutoPlay);
  bannerCarousel.addEventListener('mouseleave', startAutoPlay);

  startAutoPlay();
}

// Form Submission to Google Sheets
const experienceForm = document.querySelector('.experience-form');
if (experienceForm) {
  experienceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = experienceForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Đang gửi...';
    submitBtn.disabled = true;

    const formData = new FormData(experienceForm);
    const data = Object.fromEntries(formData.entries());

    if (data.phone) {
      let phoneStr = data.phone.trim();
      if (!phoneStr.startsWith('+')) {
        phoneStr = '+84' + (phoneStr.startsWith('0') ? phoneStr.slice(1) : phoneStr);
      }
      data.phone = phoneStr;
    }

    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwnFA4HlzmH1irh6h99ygpOd9yUnlnsw6gi0s6bGBDQ6DCRYpVGwQjoyo4tnIzPK2um0Q/exec';

    try {
      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(data),
      });

      // Assuming success due to no-cors
      submitBtn.textContent = 'Gửi thành công!';
      submitBtn.style.backgroundColor = '#4caf50';
      submitBtn.style.borderColor = '#4caf50';
      submitBtn.style.color = '#fff';

      // Get user name
      const nameInput = document.getElementById('exp-name');
      const userName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : '';

      experienceForm.reset();

      // Close experience modal
      const modal = document.getElementById('experience-modal');
      if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
      }

      // Update name in modal
      const nameDisplays = document.querySelectorAll('.user-name-display');
      nameDisplays.forEach(el => el.textContent = userName);

      // Open Thank you modal
      const thankYouModal = document.getElementById('thankyou-modal');
      if (thankYouModal) {
        thankYouModal.classList.add('is-open');
        thankYouModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Fire confetti
        if (typeof confetti === 'function') {
          var duration = 3 * 1000;
          var end = Date.now() + duration;

          (function frame() {
            confetti({
              particleCount: 5,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
            });
            confetti({
              particleCount: 5,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
            });

            if (Date.now() < end) {
              requestAnimationFrame(frame);
            }
          }());
        }
      }

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.backgroundColor = '';
        submitBtn.style.borderColor = '';
        submitBtn.style.color = '';
      }, 3000);

    } catch (error) {
      console.error('Lỗi khi gửi form:', error);
      submitBtn.textContent = 'Có lỗi xảy ra, vui lòng thử lại';
      
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }, 3000);
    }
  });
}

// Number Counter Animation
const counterElements = document.querySelectorAll('.counter');
if (counterElements.length > 0 && "IntersectionObserver" in window) {
  const counterObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const targetElement = entry.target;
        const targetValue = parseFloat(targetElement.getAttribute('data-target'));
        const suffix = targetElement.getAttribute('data-suffix') || '';
        const duration = 2000; // ms
        const isDecimal = targetValue % 1 !== 0;
        
        let startTime = null;
        const animateCount = (timestamp) => {
          if (!startTime) startTime = timestamp;
          const progress = Math.min((timestamp - startTime) / duration, 1);
          
          // Easing: easeOutQuart
          const easeProgress = 1 - Math.pow(1 - progress, 4);
          const currentVal = easeProgress * targetValue;
          
          if (isDecimal) {
            targetElement.textContent = currentVal.toFixed(1).replace('.', ',') + suffix;
          } else {
            targetElement.textContent = Math.floor(currentVal) + suffix;
          }
          
          if (progress < 1) {
            requestAnimationFrame(animateCount);
          } else {
            if (isDecimal) {
              targetElement.textContent = targetValue.toFixed(1).replace('.', ',') + suffix;
            } else {
              targetElement.textContent = targetValue + suffix;
            }
          }
        };
        
        requestAnimationFrame(animateCount);
        observer.unobserve(targetElement); // Only animate once
      }
    });
  }, { threshold: 0.1 });
  
  counterElements.forEach(el => counterObserver.observe(el));
}

// Chatbox Integration
const CHAT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbycj6JbUAkJCmbZDa9VXJ-_tM60mIiv6918DSdyH8gi3CSfbcRfm9RrmhecNwxj4VVyJw/exec';

function normalizeVietnamPhone(phone) {
  const rawPhone = phone.trim().replace(/\s+/g, '');
  if (rawPhone.startsWith('+')) return rawPhone;
  return '+84' + (rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone);
}

async function sendSupportRequest(data) {
  await fetch(CHAT_WEB_APP_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify(data),
  });
}

const supportForm = document.getElementById('support-form');
if (supportForm) {
  supportForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = document.getElementById('support-submit');
    const statusElement = document.getElementById('support-form-status');
    const formData = new FormData(supportForm);
    const requestType = formData.get('type');

    submitButton.disabled = true;
    submitButton.textContent = 'Đang gửi...';
    statusElement.textContent = '';
    statusElement.className = 'support-form-status';

    try {
      await sendSupportRequest({
        name: formData.get('name').trim(),
        phone: normalizeVietnamPhone(formData.get('phone')),
        email: formData.get('email').trim(),
        message: `[${requestType}] ${formData.get('message').trim()}`,
      });

      supportForm.reset();
      statusElement.textContent = 'Yêu cầu đã được gửi. Đội ngũ VIKA sẽ liên hệ với bạn sớm nhất.';
      statusElement.classList.add('is-success');
    } catch (error) {
      console.error('Lỗi khi gửi yêu cầu hỗ trợ:', error);
      statusElement.textContent = 'Chưa thể gửi yêu cầu. Vui lòng thử lại hoặc liên hệ qua email.';
      statusElement.classList.add('is-error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Gửi yêu cầu';
    }
  });
}

const chatToggleBtn = document.getElementById('chat-toggle');
const chatboxContainer = document.getElementById('chatbox');
const chatCloseBtn = document.getElementById('chat-close');
const chatFormView = document.getElementById('chat-form-view');
const chatMessageView = document.getElementById('chat-message-view');
const chatInfoForm = document.getElementById('chat-info-form');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatSendForm = document.getElementById('chat-send-form');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

let chatUserInfo = {};

// Open/Close Chatbox
if (chatToggleBtn && chatboxContainer) {
  chatToggleBtn.addEventListener('click', () => {
    chatboxContainer.inert = false;
    chatboxContainer.setAttribute('aria-hidden', 'false');
    chatboxContainer.classList.add('active');
    chatCloseBtn.focus();
  });

  chatCloseBtn.addEventListener('click', () => {
    chatboxContainer.classList.remove('active');
    chatboxContainer.inert = true;
    chatboxContainer.setAttribute('aria-hidden', 'true');
    chatToggleBtn.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && chatboxContainer.classList.contains('active')) chatCloseBtn.click();
  });
}

function createMessageElement(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${sender}`;
  msgDiv.innerHTML = text; 
  return msgDiv;
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  chatMessagesContainer.appendChild(indicator);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  return indicator;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

async function startAutomatedWelcome() {
  // Messages to send
  const messages = [
    `Xin chào anh/chị <b>${chatUserInfo.name}</b>! Em là trợ lý ảo của VIKA.`,
    `VIKA là ứng dụng huấn luyện viên AI cá nhân, giúp anh/chị tập luyện đúng tư thế và hiệu quả ngay tại nhà.`,
    `Anh/chị đang có câu hỏi hay cần hỗ trợ gì từ VIKA ạ?`
  ];

  for (let i = 0; i < messages.length; i++) {
    showTypingIndicator();
    // Simulate typing delay
    await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800));
    removeTypingIndicator();
    
    const msgEl = createMessageElement(messages[i], 'bot');
    chatMessagesContainer.appendChild(msgEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  // Enable input after welcome messages
  if(chatInput) chatInput.disabled = false;
  if(chatSendBtn) chatSendBtn.disabled = false;
  if(chatInput) chatInput.focus();
}

// Handle Info Form Submit
if (chatInfoForm) {
  chatInfoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    chatUserInfo = {
      name: document.getElementById('chat-name').value,
      phone: normalizeVietnamPhone(document.getElementById('chat-phone').value),
      email: document.getElementById('chat-email').value,
    };

    chatFormView.style.display = 'none';
    chatMessageView.style.display = 'flex';
    
    startAutomatedWelcome();
  });
}

// Handle Sending Message to Google Sheets
if (chatSendForm) {
  chatSendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    // Add user message to UI
    const userMsgEl = createMessageElement(messageText, 'user');
    chatMessagesContainer.appendChild(userMsgEl);
    chatInput.value = '';
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    // Disable input while sending
    chatInput.disabled = true;
    chatSendBtn.disabled = true;
    showTypingIndicator();

    const dataToSend = {
      ...chatUserInfo,
      message: messageText
    };

    try {
      await sendSupportRequest(dataToSend);

      // Simulate network delay for bot reply
      setTimeout(() => {
        removeTypingIndicator();
        const replyMsg = createMessageElement('Cảm ơn anh/chị đã gửi thông tin. Đội ngũ hỗ trợ của VIKA sẽ liên lạc với anh/chị trong thời gian sớm nhất!', 'bot');
        chatMessagesContainer.appendChild(replyMsg);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
      }, 1000);

    } catch (error) {
      console.error('Lỗi khi gửi tin nhắn:', error);
      removeTypingIndicator();
      const replyMsg = createMessageElement('Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.', 'bot');
      chatMessagesContainer.appendChild(replyMsg);
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
    }
  });
}
