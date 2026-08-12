/* VARIABLES */
/* ========================= */

const slides = document.querySelectorAll('.slide');

const dots = document.querySelectorAll('.dot');

const nextBtn = document.querySelector('.next');

const prevBtn = document.querySelector('.prev');

let current = 0;


/* ========================= */
/* MOSTRAR SLIDE */
/* ========================= */

function showSlide(index){

    slides.forEach(slide => {

        slide.classList.remove('active');

    });

    dots.forEach(dot => {

        dot.classList.remove('active');

    });

    slides[index].classList.add('active');

    dots[index].classList.add('active');
}


/* ========================= */
/* SIGUIENTE */
/* ========================= */

function nextSlide(){

    current++;

    if(current >= slides.length){

        current = 0;
    }

    showSlide(current);
}


/* ========================= */
/* ANTERIOR */
/* ========================= */

function prevSlide(){

    current--;

    if(current < 0){

        current = slides.length - 1;
    }

    showSlide(current);
}


/* ========================= */
/* EVENTOS */
/* ========================= */

nextBtn.addEventListener('click', nextSlide);

prevBtn.addEventListener('click', prevSlide);


/* ========================= */
/* CAMBIO AUTOMATICO */
/* ========================= */

setInterval(nextSlide, 5000);


/* ========================= */
/* DOTS */
/* ========================= */

dots.forEach((dot, index) => {

    dot.addEventListener('click', () => {

        current = index;

        showSlide(current);

    });

});