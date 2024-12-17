$(document).ready(function(){
    var ajaxTime= Date.now();
    var secs = 0;
    var mins = 0;
    $('.load-timer').html(secs + 's');
    var timer = setInterval(function () {
        secs = secs + 1;
        if (secs > 59) {
        mins = mins + 1;
        secs = 0;
        }
        $('.load-timer').html(secs + 's');
    },1000);
    $.ajax({
        type: "POST",
        url: "/get_mounts"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        console.log(totalTime);
        mounts = response[0]
        // localStorage.clear();
        // summary = response[1]
        // var card = $(createSummaryCard(summary));
        // $(card).appendTo('#alts').hide();
        // $('#alts').hide();
        $.each(mounts, function(i, mount) {
            var card = $(createCard(mount));
            $(card).appendTo('#mounts').hide();
        })
        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();
        $('#mounts').fadeIn(1000);
        $('#mounts > article').each(function() {
            $(this).show();
        })
        $(".slider").each(function() {
            var currentSlider = $(this);
            currentSlider.find("img").click(function() {
                var currentImage = $(this);
                var nextImage = currentImage.next();
                if (nextImage.length == 0) {
                    nextImage = currentSlider.find("img").first();
                }
                currentImage.hide();
                nextImage.show();
            });
        });
        // $('.icon').on("click", function(){
        //     $('#alts > article').hide();
        //     var altFilter = '.' + $(this).attr("data-filter");
        //     if (localStorage.getItem("altFilters") === null) {
        //         var filters = [];
        //         filters.push(altFilter);
        //         localStorage.altFilters = JSON.stringify(filters);
        //     } else {
        //         var filters = JSON.parse(localStorage.altFilters);
        //         if(jQuery.inArray(altFilter, filters) == -1) {
        //             filters.push(altFilter);
        //         } else {
        //             filters.splice( $.inArray(altFilter, filters), 1 );
        //         }
        //     }
        //     if (filters.length > 0) {
        //         localStorage.altFilters = JSON.stringify(filters);
        //         let compoundFilter = '';
        //         $.each(filters, function( index, value ) {
        //             compoundFilter = compoundFilter + value
        //         });
        //         $('#alts > article').filter(compoundFilter).fadeIn(1000);
        //     } else {
        //         localStorage.removeItem("altFilters");
        //         $('#alts > article').fadeIn(1000);
        //     }
        // })
    })
})

function createCard(mount) {
    slider = ''
    note = ''
    if (mount.mount_display.length > 1) {
        slider = 'slider'
        note = '<p class="note">Click image for other versions</p>'
    }
    let card = `
    <article class="mount card">
        <div class="card-img-top ${ slider }">
    `
    $.each(mount.mount_display, function(i, mount_image) {
        card += `
            <img class="${ slider }" src="${ mount_image.image }">
        `
    })
    // if (mount.mount_display.length > 1) {
    //     card += `
    //         <div class="slider__controls">
    //             <span class="slider__control slider__control--prev">Prev</span>
    //             <span class="slider__control slider__control--next">Next</span>
    //         </div>        
    //     `
    // }
    card += `
        </div>
        <div class="card-body">
            <h1 class="card-title mount">${ mount.name }</h1>
            <p>${ mount.description }</p>
            ${ note }
        </div>
    </article>
    `
    return card
}

function createSummaryCard(summary) {
    let card = `
    <article class="alt card summary" style="background-image: url('/static/images/output-onlinepngtools.png')">    
        <div class="card-body">
            <h1 class="card-title summary">Summary</h1>
            <dl>
                <dt>Battletag</dt>
                <dd class="card-text realm">${ summary.battletag }</dd>
                <dt>Number of accounts</dt>
                <dd class="card-text realm">${ summary.accounts }</dd>
                <dt>Number of alts</dt>
                <dd class="card-text realm">${ summary.number_alts }</dd>
                <dt>Total Gold</dt>
                <dd class="money"><span class="gold">${ Intl.NumberFormat().format(summary.gold) }</span> <span class="silver">${ summary.silver }</span> <span class="copper">${ summary.copper }</span></dd>
            </dl>
        </div>
    </article>
    `
    return card
}

$("a[href='#top']").click(function() {
$('html, body').animate({ scrollTop: 0 }, 1200);
    return false;
});