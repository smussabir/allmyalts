var alts = [];
var summary = {};

$(document).ready(function() {
    var ajaxTime = Date.now();
    var secs = 0;
    var mins = 0;
    $('.load-timer').html(secs + 's');
    var timer = setInterval(function() {
        secs = secs + 1;
        if (secs > 59) {
            mins = mins + 1;
            secs = 0;
        }
        if (mins < 1) {
            $('.load-timer').html(secs + 's');
        } else {
            $('.load-timer').html(mins + 'm' + ' ' + secs + 's');
        }
    }, 1000);

    // Ensure .status-updates container exists in your loader HTML
    // If not, create it dynamically:
    if ($('.status-updates').length === 0) {
        $('.loader-content').append('<div class="status-updates"></div>');
    }

    // Setup SSE to receive updates
    if (!!window.EventSource) {
        var source = new EventSource('/updates');
        source.onmessage = function(e) {
            // Instead of appending, we just replace the text
            $('.status-updates').text(e.data);
        };
        source.onerror = function(e) {
            console.error("SSE error", e);
            source.close();
        };
    } else {
        console.log("Your browser doesn't support SSE.");
    }

    $.ajax({
        type: "POST",
        url: "/get_alts"
    })
    .done(function(response) {
        var totalTime = Date.now()-ajaxTime;
        console.log("Total load time:", totalTime);
        localStorage.clear();

        alts = response[0];
        summary = response[1];

        var card = $(createSummaryCard(summary));
        $(card).appendTo('#alts').hide();
        $('#alts').hide();

        $.each(alts, function(i, alt) {
            var card = $(createCard(alt));
            $(card).appendTo('#alts').hide();
        });

        // Default sort: by level desc, then by name asc on ties
        sortAlts('level', 'desc');

        $('#loader').fadeOut(1000).remove();
        $('.loader-content').hide();
        $('.main-content').show();
        $('#alts').fadeIn(1000);
        $('#alts > article').each(function() {
            $(this).show();
        });

        // Filter functionality (unchanged)
        $('.icon').on("click", function() {
            $('#alts > article').hide();
            var altFilter = '.' + $(this).attr("data-filter");
            var filters = [];
            if (localStorage.getItem("altFilters") === null) {
                filters.push(altFilter);
                localStorage.altFilters = JSON.stringify(filters);
            } else {
                filters = JSON.parse(localStorage.altFilters);
                if($.inArray(altFilter, filters) == -1) {
                    filters.push(altFilter);
                } else {
                    filters.splice($.inArray(altFilter, filters), 1);
                }
            }
            if (filters.length > 0) {
                localStorage.altFilters = JSON.stringify(filters);
                let compoundFilter = '';
                $.each(filters, function(index, value) {
                    compoundFilter += value;
                });
                $('#alts > article').filter(compoundFilter).fadeIn(1000);
            } else {
                localStorage.removeItem("altFilters");
                $('#alts > article').fadeIn(1000);
            }
        });

        // Sort functionality on dropdown change
        $('#sort-selector, #sort-direction').on('change', function() {
            var sortBy = $('#sort-selector').val();
            var direction = $('#sort-direction').val(); // 'asc' or 'desc'
            sortAlts(sortBy, direction);
        });
    });
});

function sortAlts(property, direction) {
    alts.sort(function(a, b) {
        let valA = a[property];
        let valB = b[property];

        // Normalize values for comparison
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        // Convert to number if it's a numeric field
        if (property === 'achievement_points' || property === 'average_item_level' || property === 'gold' || property === 'level') {
            valA = Number(valA);
            valB = Number(valB);
        }

        // Primary comparison
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;

        // Secondary comparison: Always sort by name ascending if primary is equal
        if (property !== 'name') {
            let nameA = a.name.toLowerCase();
            let nameB = b.name.toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
        }

        return 0;
    });

    // Remove old articles except summary
    $('#alts > article').not('.summary').remove();

    // Re-render sorted cards
    $.each(alts, function(i, alt) {
        var card = $(createCard(alt));
        $(card).appendTo('#alts');
    });
}

function createCard(alt) {
    let altClass = alt.class.toLowerCase().replace(' ', '');
    let altFaction = alt.faction.toLowerCase();
    let altLevel = '';
    if (alt.level < 80) {
        altLevel = `<p class="card-text level-icon ${altClass} ${altClass}-border">${ alt.level }</p>`;
    }
    let card = `
    <article class="alt card ${altClass} ${altFaction}" style="background-image: url('${alt.main_image}')">    
        <div class="card-body">
            <h1 class="card-title ${altClass}">${ alt.name }</h1>
            <dl>
                <dt>Realm</dt>
                <dd>${ alt.realm }</dd>
                <dt>Gender Race</dt>
                <dd>${ alt.gender } ${ alt.race }</dd>
                <dt>Class</dt>
                <dd>${ alt.class }</dd>
                <dt>Achievement Points</dt>
                <dd>${ alt.achievement_points }</dd>
                <dt>Average Item Level</dt>
                <dd>${ alt.average_item_level }</dd>
            </dl>
            <dl>
                <dt>Gold</dt>
                <dd class="money"><span class="gold">${ Intl.NumberFormat().format(alt.gold) }</span> <span class="silver">${ alt.silver }</span> <span class="copper">${ alt.copper }</span></dd>
                <dt>Location</dt>
                <dd>${ alt.location }</dd>
            </dl>
    `;

    if (alt.professions.length > 0) {
        card += `<dl class="professions">`;
        $.each(alt.professions, function(i, profession) {
            let progress = (profession.skill_points / profession.max_skill_points) * 100;
            card += `
                <dt>Professions</dt>
                <dd>${ profession.name }<div class="progress-bar tooltip bottom" data-tooltip="${ profession.tier } ${profession.skill_points}/${profession.max_skill_points}"><span class="progress" style="width: ${ progress }%"></span></div></dd>
            `;
        });
        card += `</dl>`;
    }

    card += `
            <div class="card-footer">
                <p class="alt-id">${ alt.character_id }</p>
                <p class="last-login">${ alt.last_login }</p>
            </div>
            <div class="alt-icons">
                <img class="icon faction-icon ${altFaction}-icon" data-filter="${altFaction}" src="/static/images/${altFaction}.png" alt="${alt.faction} icon">
                <img class="icon class-icon" data-filter="${altClass}" src="/static/flatborder/${altClass}_flatborder.png" alt="${altClass} icon">
                ${altLevel}
            </div>
        </div>
    </article>
    `;
    return card;
}

function createSummaryCard(summary) {
    let card = `
    <article class="alt card summary">    
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
    `;
    return card;
}

$("a[href='#top']").click(function() {
    $('html, body').animate({ scrollTop: 0 }, 1200);
    return false;
});